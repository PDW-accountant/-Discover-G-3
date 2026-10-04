// 추천 계산 (개발 C) — FUNC-005, FUNC-007, FUNC-008
// 외부 API를 부르지 않는 순수 계산만 둔다. 이동시간은 lib/transit.js가 계산한 값을 받는다.

import { centerOf, distanceMeters } from './geo.js';

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const lookup = (stationsById, id) => (stationsById instanceof Map ? stationsById.get(id) : stationsById[id]);

/**
 * FUNC-005 후보 역 준비. 모임 목적의 후보 역 **전체**를 계산 대상으로 돌려준다(거리로 추리지 않는다, 10/3 결정).
 * 참여자 출발역들의 중심 좌표와 직선거리가 가장 가까운 후보 역 1곳은 '그냥 중간 지점'(FUNC-008 비교용)으로 따로 돌려준다.
 * 거리가 같으면 역 id 순. 역 정보가 없는 후보 id는 뺀다.
 * @param {'회식'|'회의'|'오락'} purpose
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 * @param {Object<string, Station>|Map<string, Station>} stationsById
 * @param {Object<string, string[]>} candidatesByPurpose data/candidates.json
 * @returns {{candidates: Station[], midpoint: Station|null}}
 */
export function pickCandidates(purpose, participants, stationsById, candidatesByPurpose) {
  const candidates = (candidatesByPurpose?.[purpose] ?? []).map((id) => lookup(stationsById, id)).filter(Boolean);
  const origins = participants.map((p) => lookup(stationsById, p.origin_station_id)).filter(Boolean);
  if (!candidates.length || !origins.length) return { candidates, midpoint: null };
  const center = centerOf(origins);
  const midpoint = [...candidates]
    .map((s) => ({ s, d: distanceMeters(center, s) }))
    .sort((a, b) => a.d - b.d || byId(a.s, b.s))[0].s;
  return { candidates, midpoint };
}

/** 한 후보 역의 공평함 값. 참여자 이동시간의 평균·모집단 표준편차·최장, 점수 = 평균 + 표준편차. */
function scoreStation(station, participantIds, times) {
  const travelTimes = Object.fromEntries(participantIds.map((pid) => [pid, times[pid][station.id]]));
  const minutes = participantIds.map((pid) => travelTimes[pid].minutes);
  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length;
  const std = Math.sqrt(minutes.reduce((a, m) => a + (m - avg) ** 2, 0) / minutes.length);
  return {
    station,
    travel_times: travelTimes,
    avg_time: avg,
    std_time: std,
    score: avg + std,
    max_time: Math.max(...minutes),
    is_estimated: participantIds.some((pid) => travelTimes[pid].is_estimated),
  };
}

const EPSILON = 1e-9; // 소수 계산 오차로 동률이 갈리지 않게

/**
 * FUNC-007 공평한 역 순위 (10/3 밤 확정): score = 평균 + 표준편차 작은 순 → 최장 시간 짧은 순 → 역 id 순.
 * 정렬 규칙은 이 함수 하나에만 둔다. 소수는 그대로 두고 화면에서 표시할 때만 반올림한다.
 * @param {Station[]} candidates
 * @param {Object<string, Object<string, {minutes, transfers, is_estimated}>>} times 참여자 id → 역 id → 시간 (transit.travelTimes)
 * @returns {Array<{rank, station, travel_times, avg_time, std_time, score, max_time, is_estimated}>} 1위가 [0]
 */
export function rankStations(candidates, times) {
  const participantIds = Object.keys(times);
  return candidates
    .map((station) => scoreStation(station, participantIds, times))
    .sort((a, b) => {
      if (Math.abs(a.score - b.score) > EPSILON) return a.score - b.score;
      if (a.max_time !== b.max_time) return a.max_time - b.max_time;
      return byId(a.station, b.station);
    })
    .map((result, i) => ({ rank: i + 1, ...result }));
}

/**
 * FUNC-008 (여유 되면) '그냥 중간 지점' 대비 단축 분 = round(중간 지점 평균 − 1위 평균).
 * 중간 지점이 1위와 같거나 0 이하면 0 (화면은 단축 문구를 숨긴다).
 * @param {ReturnType<typeof rankStations>} results
 * @param {Station|null} midpoint pickCandidates의 midpoint
 * @returns {{midpoint_station, saved_minutes:number, is_estimated:boolean}|null} 중간 지점이 없으면 null
 */
export function compareWithMidpoint(results, midpoint) {
  const top = results[0];
  const mid = midpoint && results.find((r) => r.station.id === midpoint.id);
  if (!top || !mid) return null;
  const saved = Math.round(mid.avg_time - top.avg_time);
  return { midpoint_station: midpoint, saved_minutes: saved > 0 ? saved : 0, is_estimated: mid.is_estimated || top.is_estimated };
}
