/**
 * @module audio/synth (audio-dev)
 * Web Audio 합성 프리미티브 — 외부 오디오 파일 없음 (GDD §8).
 * 톤: 8비트~칩튠 밝은 판타지. sound.js만 이 모듈을 사용한다.
 * AudioContext는 첫 사용자 제스처 이후 생성/resume (브라우저 자동재생 정책).
 * AudioContext 미지원/생성 실패 시 모든 함수가 무음 no-op — 게임 진행에 영향 없음.
 */

let ctx = null;
let master = null; // 모든 소리의 단일 출구 — 음소거/볼륨은 여기서만 제어
let sfxBus = null;
let bgmBus = null;
let noiseBuffer = null;
let muted = false;
let failed = false; // 생성 실패 → 영구 무음 스텁
let unlockInstalled = false;

const MASTER_VOLUME = 0.9;
const SFX_VOLUME = 0.5;
const BGM_VOLUME = 0.11; // BGM은 SFX를 가리지 않게 낮게 (GDD §8)

function createContext() {
  if (ctx || failed) return;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) {
    failed = true;
    return;
  }
  try {
    ctx = new AC();
  } catch (e) {
    failed = true;
    return;
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  master.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(master);

  bgmBus = ctx.createGain();
  bgmBus.gain.value = BGM_VOLUME;
  bgmBus.connect(master);

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

/** AudioContext 준비. sound.js가 첫 재생 전 호출. 재호출 무해. */
export function initSynth() {
  if (unlockInstalled || typeof window === 'undefined') return;
  unlockInstalled = true;
  // 자동재생 정책: 사용자 제스처 시점에 생성/resume. 탭 복귀 후 suspended 재개를 위해 once가 아닌 상시 리스너.
  const unlock = () => {
    createContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/**
 * 절대 시각(when, AudioContext 시간) 기준 단발음 스케줄. 모듈 내부용.
 * spec: { noise?, type?, freq?, freqEnd?, slideTime?, duration?, attack?, volume?,
 *         filter?: {type, freq, freqEnd, q} }
 */
function toneAt(spec, when, bus) {
  const dur = Math.max(spec.duration || 0.1, 0.02);
  const vol = Math.max(spec.volume != null ? spec.volume : 0.25, 0.0002);
  const attack = Math.min(spec.attack != null ? spec.attack : 0.003, dur * 0.5);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(vol, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  gain.connect(bus);

  let src;
  let head = gain;
  if (spec.filter) {
    const f = ctx.createBiquadFilter();
    f.type = spec.filter.type || 'lowpass';
    f.frequency.setValueAtTime(Math.max(spec.filter.freq || 1000, 1), when);
    if (spec.filter.freqEnd) {
      f.frequency.exponentialRampToValueAtTime(Math.max(spec.filter.freqEnd, 1), when + dur);
    }
    f.Q.value = spec.filter.q != null ? spec.filter.q : 1;
    f.connect(gain);
    head = f;
  }

  if (spec.noise) {
    src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
  } else {
    src = ctx.createOscillator();
    src.type = spec.type || 'square';
    src.frequency.setValueAtTime(Math.max(spec.freq || 440, 1), when);
    if (spec.freqEnd) {
      const slide = Math.min(spec.slideTime != null ? spec.slideTime : dur, dur);
      src.frequency.exponentialRampToValueAtTime(Math.max(spec.freqEnd, 1), when + slide);
    }
  }
  src.connect(head);
  src.onended = () => {
    src.disconnect();
    gain.disconnect();
    if (head !== gain) head.disconnect();
  };
  src.start(when);
  src.stop(when + dur + 0.05);
}

/**
 * 단발 합성음 재생 (발사음·타격음·UI음의 공통 프리미티브).
 * @param {object} spec - toneAt의 spec + {delay?: 초} — 세부는 audio-dev 재량 (모듈 내부 계약)
 */
export function playTone(spec) {
  if (!ctx || ctx.state !== 'running' || !spec) return;
  try {
    toneAt(spec, ctx.currentTime + (spec.delay || 0), sfxBus);
  } catch (e) {
    /* 오디오 오류는 게임에 전파하지 않는다 */
  }
}

// ── BGM: 밝은 판타지 칩튠 루프 (C–G–Am–F, 룩어헤드 스케줄러) ──────────────

const BGM_TEMPO = 112; // BPM
const BGM_STEP = 60 / BGM_TEMPO / 2; // 8분음표 길이(초)
const BGM_CHORDS = [
  { bass: 130.81, arp: [261.63, 329.63, 392.0, 523.25] },  // C
  { bass: 98.0,   arp: [196.0, 246.94, 293.66, 392.0] },   // G
  { bass: 110.0,  arp: [220.0, 261.63, 329.63, 440.0] },   // Am
  { bass: 87.31,  arp: [174.61, 220.0, 261.63, 349.23] },  // F
];
const BGM_ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2]; // 코드당 8스텝
const BGM_TOTAL_STEPS = BGM_CHORDS.length * 8;

let bgmTimer = null;
let bgmStepIndex = 0;
let bgmNextTime = 0;

function scheduleBgmStep(step, when) {
  const chord = BGM_CHORDS[Math.floor(step / 8)];
  const sub = step % 8;
  if (sub === 0 || sub === 4) {
    toneAt({ type: 'triangle', freq: chord.bass, duration: BGM_STEP * 1.8, volume: 0.5, attack: 0.01 }, when, bgmBus);
  }
  toneAt({ type: 'square', freq: chord.arp[BGM_ARP_PATTERN[sub]], duration: BGM_STEP * 0.85, volume: 0.16, attack: 0.005 }, when, bgmBus);
}

function bgmTick() {
  if (!ctx || ctx.state !== 'running') return;
  if (bgmNextTime < ctx.currentTime) bgmNextTime = ctx.currentTime + 0.05;
  const horizon = ctx.currentTime + 0.3;
  while (bgmNextTime < horizon) {
    try {
      scheduleBgmStep(bgmStepIndex, bgmNextTime);
    } catch (e) {
      /* 무시 — 다음 스텝 계속 */
    }
    bgmStepIndex = (bgmStepIndex + 1) % BGM_TOTAL_STEPS;
    bgmNextTime += BGM_STEP;
  }
}

/**
 * BGM 루프 시작/정지 — 단순 루프 1곡, SFX를 가리지 않는 낮은 볼륨.
 * @param {boolean} on
 */
export function setBgm(on) {
  if (on) {
    if (bgmTimer || failed) return;
    bgmStepIndex = 0;
    bgmNextTime = 0;
    bgmTimer = setInterval(bgmTick, 100);
  } else if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

/** @param {boolean} m - 마스터 음소거 (BGM+SFX 전체) */
export function setMuted(m) {
  muted = !!m;
  if (!ctx || !master) return; // 컨텍스트 생성 시점에 muted가 반영됨
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, t, 0.01); // 클릭 노이즈 방지 램프
}
