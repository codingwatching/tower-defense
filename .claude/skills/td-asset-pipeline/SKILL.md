---
name: td-asset-pipeline
description: "codex-cli(codex exec)의 image_generation 툴로 타워 디펜스 게임 이미지 에셋(타워·적·투사체·타일·UI)을 병렬 배치 생성하고 검수·후처리하는 파이프라인. 게임 에셋 생성, 스프라이트 제작, 이미지 재생성, 에셋 추가, codex 이미지 관련 요청 시 반드시 사용. 오디오는 범위 아님(Web Audio 합성)."
---

# TD Asset Pipeline — codex-cli 에셋 생성 파이프라인

`assets/manifest.js`의 키 전체를 codex-cli로 생성해 게임에 투입 가능한 PNG로 만드는 절차. 사용자 레벨 `codex-image` 스킬의 실측 패턴을 이 게임에 특화한 것이다.

## 0. 사전 점검 (배치 시작 전 1회)

```bash
codex --version && codex login status
```

미로그인이면 즉시 중단하고 오케스트레이터에 보고한다 — `codex login`은 사용자만 실행할 수 있다.

## 1. 에셋 스펙 표 작성

생성 전에 매니페스트 키 전체를 표로 확정한다. 즉흥 생성은 스타일 불일치와 키 누락을 만든다.

| 카테고리 | 파일 경로 | 수량 가이드 |
|---|---|---|
| 타워 | `assets/images/towers/{type}.png` (+`_lv2`,`_lv3` 업그레이드 외형) | 4종 × 1~3 |
| 적 | `assets/images/enemies/{type}.png` | 4종 + boss |
| 투사체 | `assets/images/projectiles/{type}.png` | 타워당 1 |
| 맵 타일 | `assets/images/map/{grass,path,decor}.png` | 3~5 |
| UI | `assets/images/ui/{icon_*,bg_title}.png` | 타워 아이콘 4 + 타이틀 배경 |

## 2. 스타일 통일 프롬프트

**모든 에셋 프롬프트는 동일한 프리픽스로 시작한다:**

```
2D game sprite for a top-down tower defense game, clean vibrant cartoon style,
bold outlines, single object centered, isolated on a fully transparent background,
no text, no watermark, no drop shadow outside the object
```

뒤에 개별 묘사를 붙인다. 예: `..., a stone watchtower with a blue crystal cannon on top, seen from a high 3/4 angle`

- **탑다운/하이앵글 3/4 뷰**로 통일한다 — 시점이 섞이면 한 화면에서 어색하다.
- 맵 타일만 예외: `seamless tileable top-down grass texture tile` 형태로, 투명 배경 대신 꽉 찬 텍스처를 요청한다.
- 투명 배경이 실패할 경우를 대비해 재시도 프롬프트에는 `solid magenta #FF00FF background` 를 지정한다 — 엔진 로더가 크로마키로 제거한다.

## 3. 병렬 배치 생성

**5장 단위 배치, 파일명 전부 상이, 백그라운드 실행.** 배치 헬퍼가 있으면 우선 사용:

```bash
~/.claude/skills/codex-image/scripts/codex_imagegen_batch.sh /Users/robin/Downloads/tower-defense/assets/images/towers \
  "<프리픽스>, <타워1 묘사>::arrow.png" \
  "<프리픽스>, <타워2 묘사>::cannon.png" \
  ...최대 5개
```

헬퍼가 없으면 수동 병렬 — 한 메시지에서 Bash `run_in_background: true`로 최대 5개 동시 실행:

```bash
codex exec --sandbox workspace-write --skip-git-repo-check \
  --cd /Users/robin/Downloads/tower-defense/assets/images/towers \
  -o /tmp/codex-img-arrow.md \
  "이미지 생성 도구로 '<프롬프트>' 이미지를 생성하고 ./arrow.png 로 저장. 파일 경로만 한 줄로 보고."
```

- 완료는 백그라운드 통지로 수신한다. `sleep` 폴링 금지.
- 장당 80~110초가 정상. 6개 이상 동시 실행 금지 (큐잉으로 분산 악화).
- `--ask-for-approval` 부착 금지 (비대화형에서 즉시 에러).

## 4. 검수 (배치마다)

```bash
cd /Users/robin/Downloads/tower-defense
file assets/images/**/*.png                # PNG 유효성
find assets/images -name "*.png" -size -1k # 0바이트/깨진 파일
sips -g hasAlpha assets/images/towers/*.png # 알파 채널 확인
```

이어서 Read 도구로 각 PNG를 열어 육안 검수한다: 스타일 일관성, 객체 잘림, 의도와 다른 내용.

**판정 규칙:**
- 손상/0바이트 → 해당 장만 즉시 재생성 (배치 전체 재실행 금지)
- 알파 없음(불투명) → 마젠타 배경 프롬프트로 1회 재생성, 재실패 시 그대로 채택하고 리포트에 "크로마키 의존" 표기
- 스타일 이탈 → 프롬프트에 이탈 원인 부정어 추가(`no realistic rendering` 등) 후 재생성, 총 2회 한도

## 5. 후처리 규격화

생성 원본은 1254×1254 안팎으로 크다. 게임 규격으로 일괄 축소한다:

```bash
sips -Z 128 assets/images/towers/*.png assets/images/enemies/*.png   # 유닛류 128px
sips -Z 64  assets/images/projectiles/*.png assets/images/ui/icon_*.png # 소형 64px
sips -Z 256 assets/images/map/*.png                                  # 타일 256px
```

(정밀 해상도가 필요 없는 이유: 캔버스 drawImage가 타일 크기로 다시 스케일한다. 축소는 로딩 용량 절감 목적.)

## 6. 산출물 리포트

`_workspace/03_artist_asset-report.md`에 표로 기록: `키 | 파일 | 상태(성공/재생성N회/크로마키/플레이스홀더 유지) | 비고`. 매니페스트의 전 키가 표에 있어야 완료다.

## 알려진 함정

| 증상 | 조치 |
|---|---|
| 파일이 작업 폴더에 없고 `~/.codex/generated_images/`에만 있음 | 프롬프트의 "./<파일> 로 저장" 문구 강화 후 재실행 |
| "image_generation tool not available" | `codex features list` 확인, `--enable image_generation` 명시 |
| 전 배치가 비정상적으로 느림(300초+/장) | 플랜 한도 가능성 — 배치를 3장으로 축소하고 오케스트레이터에 보고 |
| 동일 출력 경로 충돌 | 배치 내 파일명 전부 상이한지 실행 전 재확인 |
