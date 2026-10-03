// 지하철 이동시간 계산 (개발 C) — FUNC-006
// 외부 API 없이 공공데이터로 만든 data/transit-graph.json에서 최단 시간을 구한다 (CLAUDE.md 7장).
// 그래프 노드 = "역id:호선", 간선 = { from, to, minutes, type: 'ride'(같은 호선 인접 역) | 'transfer'(같은 역 다른 호선) }
// (그래프 파일 형식은 개발 C가 변환 스크립트를 만들며 바꿀 수 있다. 바꾸면 이 주석도 고친다.)

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
