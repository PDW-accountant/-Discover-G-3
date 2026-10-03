// 예시로 해보기 (개발 A, 개발 C) — FUNC-004
// data/demo.json의 시나리오를 불러온다. 도착 시간은 항상 현재 시각 이후로 보정한다.
// 미리 저장한 결과가 있으면 외부 조회 없이 그 결과를 쓴다.

/** @returns {{request, participants, savedResults|null}} */
export function loadScenario(demo, scenarioId, now = new Date()) {
  throw new Error('아직 구현되지 않았습니다');
}
