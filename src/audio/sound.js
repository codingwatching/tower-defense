/**
 * @module audio/sound (audio-dev)
 * 이벤트 → SFX/BGM 매핑. 필수 SFX (GDD §8): 타워별 발사음 4종(구분 가능), 명중음,
 * 적 사망음, 건설음, 판매음, 업그레이드음, 에러음, 웨이브 시작 팡파레,
 * 라이프 손실 경고음, 승리/패배 징글.
 *
 * 구독만 (읽기 API 금지 — 이 모듈 삭제 시에도 게임 동작).
 * 이벤트 이름·페이로드: _workspace/02_architect_architecture.md §3.
 * 클릭음: 시작/재시작은 game:started로 통합(ui-dev 제안 — *-requested 중복 회피),
 * tower:selected·ui:speed-changed는 계약 기존 이벤트에 listen-only 추가 구독.
 */

import { on } from '../core/events.js';
import { initSynth, playTone, setBgm, setMuted } from './synth.js';

/** 같은 효과음 동시 발음 상한 — 대량 사망 시 소리 폭발 방지 */
const MAX_VOICES = 3;
const activeVoices = new Map(); // sfx 키 → 현재 재생 중 개수

/** 반복 청취 피로를 줄이는 미세 피치 편차 */
function jitter(freq, pct = 0.04) {
  return freq * (1 + (Math.random() * 2 - 1) * pct);
}

/**
 * SFX 정의 — 키마다 playTone spec 배열을 반환하는 팩토리 (호출마다 피치 지터 반영).
 * 빈발음(발사/명중/사망/코인)은 전부 0.5초 이내. 승리/패배 징글만 1회성이라 예외적으로 ~1.2초.
 */
const SFX = {
  // 타워 발사음 4종 — 서로 뚜렷이 구분 (AC 대응: GDD §8 "구분 가능해야 함")
  fire_arrow: () => [
    { type: 'square', freq: jitter(900), freqEnd: 300, duration: 0.09, volume: 0.16 },
  ],
  fire_cannon: () => [
    { noise: true, filter: { type: 'lowpass', freq: 900, freqEnd: 120 }, duration: 0.3, volume: 0.5 },
    { type: 'sine', freq: 100, freqEnd: 40, duration: 0.28, volume: 0.45 },
  ],
  fire_frost: () => [
    { type: 'triangle', freq: jitter(1200), freqEnd: 2400, duration: 0.18, volume: 0.14 },
    { noise: true, filter: { type: 'bandpass', freq: 3200, q: 4 }, duration: 0.12, volume: 0.07, delay: 0.02 },
  ],
  fire_arcane: () => [
    { type: 'sawtooth', freq: jitter(160), freqEnd: 640, duration: 0.22, volume: 0.2 },
    { type: 'square', freq: jitter(80), freqEnd: 320, duration: 0.22, volume: 0.1 },
  ],

  // 전투 피드백
  hit: () => [
    { type: 'square', freq: jitter(700, 0.08), duration: 0.035, volume: 0.07 },
  ],
  die: () => [
    { type: 'square', freq: jitter(520), freqEnd: 120, duration: 0.14, volume: 0.18 },
    { noise: true, filter: { type: 'lowpass', freq: 1500 }, duration: 0.06, volume: 0.09 },
  ],
  coin: () => [
    { type: 'sine', freq: 987.77, duration: 0.06, volume: 0.14, delay: 0.05 },
    { type: 'sine', freq: 1318.51, duration: 0.12, volume: 0.14, delay: 0.11 },
  ],
  escape: () => [
    { type: 'sawtooth', freq: 600, freqEnd: 80, duration: 0.32, volume: 0.2 },
  ],
  alarm: () => [
    { type: 'square', freq: 622.25, duration: 0.11, volume: 0.26 },
    { type: 'square', freq: 466.16, duration: 0.13, volume: 0.26, delay: 0.13 },
  ],

  // 타워 생애주기
  build: () => [
    { noise: true, filter: { type: 'lowpass', freq: 600 }, duration: 0.07, volume: 0.35 },
    { type: 'triangle', freq: 180, freqEnd: 90, duration: 0.09, volume: 0.3 },
    { noise: true, filter: { type: 'lowpass', freq: 500 }, duration: 0.07, volume: 0.28, delay: 0.13 },
    { type: 'triangle', freq: 160, freqEnd: 85, duration: 0.09, volume: 0.24, delay: 0.13 },
  ],
  upgrade: () => [
    { type: 'square', freq: 523.25, duration: 0.07, volume: 0.16 },
    { type: 'square', freq: 659.25, duration: 0.07, volume: 0.16, delay: 0.08 },
    { type: 'square', freq: 783.99, duration: 0.07, volume: 0.16, delay: 0.16 },
    { type: 'square', freq: 1046.5, duration: 0.16, volume: 0.18, delay: 0.24 },
  ],
  sell: () => [
    { type: 'square', freq: 739.99, duration: 0.08, volume: 0.15 },
    { type: 'square', freq: 493.88, duration: 0.1, volume: 0.15, delay: 0.09 },
    { type: 'sine', freq: 987.77, duration: 0.1, volume: 0.12, delay: 0.22 },
  ],

  // UI
  click: () => [
    { type: 'square', freq: 2000, duration: 0.025, volume: 0.09 },
  ],
  error: () => [
    { type: 'square', freq: 233.08, duration: 0.09, volume: 0.18 },
    { type: 'square', freq: 174.61, duration: 0.14, volume: 0.18, delay: 0.1 },
  ],

  // 웨이브·보스·게임 흐름
  fanfare: () => [
    { type: 'square', freq: 523.25, duration: 0.09, volume: 0.18 },
    { type: 'square', freq: 659.25, duration: 0.09, volume: 0.18, delay: 0.09 },
    { type: 'square', freq: 783.99, duration: 0.2, volume: 0.2, delay: 0.18 },
    { type: 'triangle', freq: 1567.98, duration: 0.2, volume: 0.1, delay: 0.18 },
  ],
  bonus: () => [
    { type: 'sine', freq: 783.99, duration: 0.07, volume: 0.14 },
    { type: 'sine', freq: 987.77, duration: 0.07, volume: 0.14, delay: 0.08 },
    { type: 'sine', freq: 1318.51, duration: 0.16, volume: 0.16, delay: 0.16 },
  ],
  boss: () => [
    { type: 'sawtooth', freq: 110, freqEnd: 55, duration: 0.5, volume: 0.38, delay: 0.2 },
    { type: 'square', freq: 55, duration: 0.5, volume: 0.2, delay: 0.2 },
    { noise: true, filter: { type: 'lowpass', freq: 200 }, duration: 0.5, volume: 0.28, delay: 0.2 },
  ],
  victory: () => [
    { type: 'square', freq: 523.25, duration: 0.12, volume: 0.18 },
    { type: 'square', freq: 659.25, duration: 0.12, volume: 0.18, delay: 0.13 },
    { type: 'square', freq: 783.99, duration: 0.12, volume: 0.18, delay: 0.26 },
    { type: 'square', freq: 1046.5, duration: 0.3, volume: 0.2, delay: 0.39 },
    { type: 'square', freq: 1046.5, duration: 0.55, volume: 0.16, delay: 0.62 },
    { type: 'square', freq: 1318.51, duration: 0.55, volume: 0.16, delay: 0.62 },
    { type: 'square', freq: 1567.98, duration: 0.55, volume: 0.16, delay: 0.62 },
    { type: 'triangle', freq: 261.63, duration: 0.55, volume: 0.3, delay: 0.62 },
  ],
  defeat: () => [
    { type: 'sawtooth', freq: 440, duration: 0.22, volume: 0.18 },
    { type: 'sawtooth', freq: 329.63, duration: 0.22, volume: 0.18, delay: 0.2 },
    { type: 'sawtooth', freq: 261.63, duration: 0.22, volume: 0.18, delay: 0.4 },
    { type: 'sawtooth', freq: 220, freqEnd: 110, duration: 0.5, volume: 0.2, delay: 0.6 },
    { type: 'triangle', freq: 110, duration: 0.5, volume: 0.24, delay: 0.6 },
  ],
};

const FIRE_BY_TYPE = {
  arrow: 'fire_arrow',
  cannon: 'fire_cannon',
  frost: 'fire_frost',
  arcane: 'fire_arcane',
};

function playSfx(key) {
  const def = SFX[key];
  if (!def) return;
  const count = activeVoices.get(key) || 0;
  if (count >= MAX_VOICES) return;
  const specs = def();
  let total = 0;
  for (const spec of specs) {
    playTone(spec);
    total = Math.max(total, (spec.delay || 0) + (spec.duration || 0.1));
  }
  activeVoices.set(key, count + 1);
  setTimeout(() => {
    activeVoices.set(key, Math.max(0, (activeVoices.get(key) || 1) - 1));
  }, total * 1000);
}

let inited = false;

/** 구독 등록. main이 1회 호출. 실패해도 게임에 영향 없음. */
export function initSound() {
  if (inited) return;
  inited = true;
  initSynth();

  // 오디오 핸들러의 예외는 이벤트 버스(동기 호출)를 타고 게임 로직을 깨면 안 된다
  const sub = (name, fn) => {
    on(name, (payload) => {
      try {
        fn(payload || {});
      } catch (e) {
        /* 무음 실패 */
      }
    });
  };

  // 게임 흐름 (시작/재시작 확인 클릭은 여기서 — ui:*-requested 구독 없이 중복 회피)
  sub('game:started', () => { playSfx('click'); setBgm(true); });
  sub('game:won', () => { setBgm(false); playSfx('victory'); });
  sub('game:over', () => { setBgm(false); playSfx('defeat'); });

  // 웨이브
  sub('wave:started', () => playSfx('fanfare'));
  sub('wave:cleared', () => playSfx('bonus'));
  sub('boss:spawned', () => playSfx('boss'));

  // 전투
  sub('tower:fired', (p) => playSfx(FIRE_BY_TYPE[p.towerType] || 'fire_arrow'));
  sub('projectile:hit', () => playSfx('hit'));
  sub('enemy:killed', () => { playSfx('die'); playSfx('coin'); });
  sub('enemy:escaped', () => playSfx('escape'));
  sub('lives:changed', (p) => { if ((p.delta || 0) < 0) playSfx('alarm'); });

  // 타워 생애주기
  sub('tower:placed', () => playSfx('build'));
  sub('tower:upgraded', () => playSfx('upgrade'));
  sub('tower:sold', () => playSfx('sell'));
  sub('build:rejected', () => playSfx('error'));
  sub('ui:error', () => playSfx('error'));

  // UI 클릭 (계약 §3의 기존 이벤트에 listen-only 추가 구독)
  // ui:wave-start-requested는 무음 — 직후 wave:started 팡파레가 피드백 (ui-dev 협의)
  sub('tower:selected', () => playSfx('click'));
  sub('ui:speed-changed', () => playSfx('click'));

  // 음소거 토글 — 해제 시에만 확인 클릭 (음소거 중엔 마스터 게인 0이라 어차피 무음)
  sub('ui:mute-changed', (p) => {
    setMuted(!!p.muted);
    if (!p.muted) playSfx('click');
  });
}
