// 거리·좌표 계산 (개발 C) — FUNC-005, SFR-020(대체 시간)
// Station: { id, name, lines[], lat, lng }

import { ESTIMATE_METERS_PER_MINUTE } from '../config.js';

const EARTH_RADIUS_M = 6371000;
const rad = (deg) => (deg * Math.PI) / 180;

/** 두 지점 사이 직선거리(m). 하버사인 공식. */
export function distanceMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 여러 역의 중심 좌표(위도·경도 평균). @returns {{lat:number, lng:number}} */
export function centerOf(stations) {
  throw new Error('아직 구현되지 않았습니다');
}

/**
 * 직선거리 기반 예상 이동시간. 지하철 그래프에 없는 역이거나 도달할 수 없을 때의 대체 값 (SFR-020).
 * 분속 ESTIMATE_METERS_PER_MINUTE(약 70m) 환산, 분 단위 올림, 환승 0. 같은 역이면 0분.
 * @returns {{minutes:number, transfers:number, steps:[], is_estimated:true}}
 */
export function estimateTravel(from, to) {
  return { minutes: Math.ceil(distanceMeters(from, to) / ESTIMATE_METERS_PER_MINUTE), transfers: 0, steps: [], is_estimated: true };
}
