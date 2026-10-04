// 지하철 이동시간 계산 (개발 C) — FUNC-006
// 외부 API 없이 공공데이터로 만든 data/transit-graph.json에서 최단 시간을 구한다 (CLAUDE.md 7장).
// 그래프 형식 (scripts/convert.js 가 만듦, #14 10/4 변경):
//   노드 = "역id:계통id". 계통 = 갈아타지 않고 쭉 갈 수 있는 열차 노선 단위 (예: 1-incheon, 2-main, 5-macheon, 9, 9-express)
//   routes = [{ id, line, name, express }]  (steps 의 호선·급행 표시에 쓴다)
//   edges  = { from, to, minutes, type, estimated?, assumed?, filled? }
//     'ride'     같은 계통 인접 역 운행시간(분). estimated: true 는 공식 값이 없어 열차 시간표로 계산한 값
//     'transfer' 같은 역 다른 계통 환승 도보시간(분, 대기 미포함) → 여기에 WAIT_MINUTES 를 더한다. 환승 횟수 +1
//     'swap'     같은 노선 급행↔일반 갈아타기(0분) → WAIT_MINUTES 는 더하지만 환승 횟수에는 세지 않는다

export const WAIT_MINUTES = 3; // 배차 대기 상수. 검증 결과 보고 조정 (CLAUDE.md 10장 미결)

/**
 * 출발역 → 도착역 최단 이동시간 (다익스트라). 출발역이 여러 호선이면 모든 호선 노드에서 시작한다.
 * 결과 = 운행시간 합 + 환승시간 합 + WAIT_MINUTES × (환승 횟수 + 1), 분 단위 올림.
 * 같은 역이면 0분. 그래프에서 도달할 수 없거나 그래프에 없는 역이면 geo.estimateTravel로 대체(is_estimated=true).
 * @returns {{minutes:number, transfers:number, steps:Array<{line, from, to, minutes}>, is_estimated:boolean}}
 */
export function travelTime(graph, fromStation, toStation) {
  throw new Error('아직 구현되지 않았습니다');
}

/**
 * 참여자 × 후보 역 이동시간을 한 번에 계산 (후보 3곳 × 최대 9명 = 27건, 브라우저에서 1초 안, NFR-001).
 * @returns {Object<string, Object<string, ReturnType<typeof travelTime>>>} 참여자 id → 역 id → 결과
 */
export function travelTimes(graph, participants, candidates, stationsById) {
  throw new Error('아직 구현되지 않았습니다');
}
