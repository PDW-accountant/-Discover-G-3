// 추천 계산 (개발 C) — FUNC-005 / FUNC-007·008은 기획팀 논의 후
// 외부 API를 부르지 않는 순수 계산만 둔다. 이동시간은 lib/transit.js가 계산한 값을 받는다.

/**
 * FUNC-005 후보 역 1차 추리기.
 * 모임 목적의 후보 역 중 참여자 출발역들의 중심 좌표와 직선거리가 가까운 순으로 3곳.
 * 거리가 같으면 역 id 순. 가장 가까운 1곳은 '그냥 중간 지점'으로 따로 돌려준다.
 * @param {'회식'|'회의'|'오락'} purpose
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 * @param {Object<string, Station>} stationsById
 * @param {Object<string, string[]>} candidatesByPurpose data/candidates.json
 * @returns {{candidates: Station[], midpoint: Station}}
 */
export function pickCandidates(purpose, participants, stationsById, candidatesByPurpose) {
  throw new Error('아직 구현되지 않았습니다');
}

/**
 * FUNC-007 공평한 역 순위. ※ 공평함 기준은 논의 중(미확정, CLAUDE.md 10장).
 * 기준을 바꿔 끼울 수 있게 이 함수 하나에만 둔다. 임시 기본값: 가장 오래 걸리는 사람의 시간이 짧은 순.
 * @param {Station[]} candidates
 * @param {Object<string, Object<string, {minutes, transfers, is_estimated}>>} times 참여자 id → 역 id → 시간
 * @returns {Array<{rank, station, travel_times, max_time, avg_time, time_gap, is_estimated}>}
 */
export function rankStations(candidates, times) {
  throw new Error('아직 구현되지 않았습니다');
}

/**
 * FUNC-008 (여유 되면) '그냥 중간 지점' 대비 단축 분. ※ FUNC-007 기준이 정해진 뒤 구현.
 * @returns {{midpoint_station, saved_minutes:number, is_estimated:boolean}}
 */
export function compareWithMidpoint(results, midpoint, times) {
  throw new Error('아직 구현되지 않았습니다');
}
