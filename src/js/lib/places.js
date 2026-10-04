// 만남 장소 (개발 C, 개발 A) — FUNC-010, FUNC-011

const MAX_CARDS = 3; // order 1~3은 카드, 4 이후는 '더 보기'(FUNC-017)

/**
 * 해당 역·모임 목적의 장소를 order 순으로 최대 3곳 돌려준다. 0곳이면 빈 배열(화면에서 카카오맵 검색 링크 안내).
 * @returns {Array<Place>}
 */
export function placesFor(places, stationId, purpose) {
  return (places ?? [])
    .filter((p) => p.station_id === stationId && p.purpose === purpose)
    .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
    .slice(0, MAX_CARDS);
}

/** '보기' 링크: kakao_url → naver_url → 카카오맵 장소명 검색 링크 순. */
export function placeLink(place) {
  return place.kakao_url || place.naver_url || `https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`;
}
