#!/usr/bin/env bash
# W3-8 v3 통합 QA 게이트 — D24-1 해소 시 즉시 실행. 전 헤드리스 경계면 + sim + 감사 종합.
# 사용: bash _workspace/qa_scratch/qa-v3-gate.sh  (exit 0 = v3 헤드리스 QA 그린)
cd "$(dirname "$0")/../.." || exit 2
FAIL=0
run() { echo "── $1"; shift; "$@"; local ec=$?; [ $ec -ne 0 ] && { echo "  ✗ FAIL (exit $ec)"; FAIL=1; } || echo "  ✓ pass"; }

echo "═══ W3-8 v3 통합 게이트 ═══"

# 1. 문법 게이트 (전 src)
echo "── 1. 문법 게이트 (src 전 파일 + sim)"
sfail=0
for f in $(find src -name "*.js"); do node --input-type=module --check < "$f" 2>/dev/null || { echo "  FAIL parse $f"; sfail=1; }; done
node --check scripts/sim.mjs 2>/dev/null || { echo "  FAIL parse sim.mjs"; sfail=1; }
[ $sfail -eq 0 ] && echo "  ✓ 전 파일 파스 OK" || FAIL=1

# 2. 헤드리스 경계면 하네스 8종
run "2a. LEVELS[0] byte-identity"        node _workspace/qa_scratch/qa-verify-v3-levels0.mjs
run "2b. LEVELS 5스테이지 정합·기하"     node _workspace/qa_scratch/qa-verify-v3-all-levels.mjs
run "2c. 실 grid/path 로드 + 체비쇼프"   node _workspace/qa_scratch/qa-verify-v3-realload.mjs
run "2d. score/storage 집계·폴백"        node _workspace/qa_scratch/qa-verify-v3-score-progress.mjs
run "2e. progress 해금 캐스케이드"       node _workspace/qa_scratch/qa-verify-v3-unlock.mjs
run "2f. waves 스테이지 캐싱"            node _workspace/qa_scratch/qa-verify-v3-waves-cache.mjs
run "2g. 실데이터 통합(STAGE_*·SCORING)" node _workspace/qa_scratch/qa-verify-v3-realdata-integ.mjs
run "2h. UI 경계면(순서 불변식 포함)"    node _workspace/qa_scratch/qa-verify-v3-ui.mjs

# 3. sim.mjs 스테이지 회귀 (D24-1 — exit 0 요구)
echo "── 3. sim.mjs 스테이지 회귀 (AC-37·AC-44)"
node scripts/sim.mjs >/tmp/qa_v3_sim.txt 2>&1
simec=$?
tail -3 /tmp/qa_v3_sim.txt | sed 's/^/    /'
[ $simec -eq 0 ] && echo "  ✓ sim exit 0" || { echo "  ✗ sim exit $simec (D24-1 미해소)"; FAIL=1; }

# 4. v3 이벤트 7종 emit↔on 고아 0
echo "── 4. v3 이벤트 emit↔on 고아 검사"
ofail=0
for ev in ui:stage-select-requested ui:stage-selected stage:started score:changed score:finalized stage:record-updated stage:unlocked; do
  e=$(grep -rn "emit('$ev'" src | grep -vE "//|^\s*\*|: \*" | wc -l | tr -d ' ')
  o=$(grep -rn "on('$ev'" src | grep -vE "//|^\s*\*|: \*" | wc -l | tr -d ' ')
  { [ "$e" -eq 0 ] || [ "$o" -eq 0 ]; } && { echo "  ORPHAN $ev emit:$e on:$o"; ofail=1; }
done
[ $ofail -eq 0 ] && echo "  ✓ 7종 전부 emit↔on 쌍" || FAIL=1

# 5. 상대경로 감사 (§12)
echo "── 5. 상대경로 감사 (§12)"
m=$(grep -rEn '(src|href)="/|url\(/|fetch\(["'"'"']/|import\(["'"'"']/|from ["'"'"']/' index.html css src assets/manifest.js 2>/dev/null | wc -l | tr -d ' ')
[ "$m" -eq 0 ] && echo "  ✓ 매치 0건" || { echo "  ✗ $m건"; FAIL=1; }

echo ""
[ $FAIL -eq 0 ] && echo "═══ ✔ W3-8 v3 헤드리스 게이트 전건 그린 ═══" || echo "═══ ✘ W3-8 미통과 (위 FAIL 참조) ═══"
exit $FAIL
