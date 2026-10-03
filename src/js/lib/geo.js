// 거리·좌표 계산 (개발 C) — FUNC-005, SFR-020(대체 시간)
// Station: { id, name, lines[], lat, lng }

/** 두 지점 사이 직선거리(m). 하버사인 공식. */
export function distanceMeters(a, b) {
  throw new Error('아직 구현되지 않았습니다');
}

/** 여러 역의 중심 좌표(위도·경도 평균). @returns {{lat:number, lng:number}} */
export function centerOf(stations) {
  throw new Error('아직 구현되지 않았습니다');
}

/**
 * 직선거리 기반 예상 이동시간. 이동시간 조회가 실패하거나 쓸 수 없을 때의 대체 값 (SFR-020).
 * 분속 약 70m 환산, 환승 0. 같은 역이면 0분.
 * @returns {{minutes:number, transfers:number, steps:[], is_estimated:true}}
 */
export function estimateTravel(from, to) {
  throw new Error('아직 구현되지 않았습니다');
}
