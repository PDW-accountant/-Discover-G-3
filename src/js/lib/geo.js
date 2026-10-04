// 거리·좌표 계산 (개발 C) — FUNC-005, SFR-020(대체 시간)
// Station: { id, name, lines[], lat, lng }

const EARTH_RADIUS_M = 6371008.8;   // 지구 평균 반지름(m)
const WALK_METERS_PER_MINUTE = 70;  // 대체 시간 환산 속도 (CLAUDE.md 5장 '분속 약 70m')

const toRad = (deg) => (deg * Math.PI) / 180;

/** 두 지점 사이 직선거리(m). 하버사인 공식. */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 여러 역의 중심 좌표(위도·경도 평균). @returns {{lat:number, lng:number}} */
export function centerOf(stations) {
  const sum = stations.reduce((acc, s) => ({ lat: acc.lat + s.lat, lng: acc.lng + s.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / stations.length, lng: sum.lng / stations.length };
}

/**
 * 직선거리 기반 예상 이동시간. 지하철 그래프에 없는 역이거나 도달할 수 없을 때의 대체 값 (SFR-020).
 * 분속 약 70m 환산, 환승 0. 같은 역이면 0분.
 * @returns {{minutes:number, transfers:number, steps:[], is_estimated:true}}
 */
export function estimateTravel(from, to) {
  const minutes = from.id === to.id ? 0 : Math.ceil(distanceMeters(from, to) / WALK_METERS_PER_MINUTE);
  return { minutes, transfers: 0, steps: [], is_estimated: true };
}
