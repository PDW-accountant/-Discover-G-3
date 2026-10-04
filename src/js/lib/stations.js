// 출발역 목록 정렬·검색 (개발 A) — FUNC-002
// Station: { id, name, lines[], lat, lng } (data/stations.json). 서울 밖 역 제외는 데이터 변환(FUNC-016)에서 한다.

// 호선 표시: [동그라미 안 글자, 노선 색, 글자 색]. 목록에 없는 호선은 이름 그대로 회색으로 보여준다.
export const LINE_BADGES = {
  1: ['1', '#0052A4', '#fff'], 2: ['2', '#00A84D', '#fff'], 3: ['3', '#EF7C1C', '#fff'], 4: ['4', '#00A5DE', '#fff'],
  5: ['5', '#996CAC', '#fff'], 6: ['6', '#CD7C2F', '#fff'], 7: ['7', '#747F00', '#fff'], 8: ['8', '#E6186C', '#fff'],
  9: ['9', '#BDB092', '#000'],
  신분당: ['신분', '#D4003B', '#fff'], 공항철도: ['공항', '#0090D2', '#fff'], 경의중앙: ['경의', '#77C4A3', '#000'],
  수인분당: ['수인', '#F5A200', '#000'], 신림: ['신림', '#6789CA', '#fff'], 우이신설: ['우이', '#B0CE18', '#000'],
  경춘: ['경춘', '#0C8E72', '#fff'],
};

/** 호선 하나의 표시값. @returns {{label, background, color}} */
export function lineBadge(line) {
  const [label, background, color] = LINE_BADGES[line] ?? [String(line), '#8c959f', '#fff'];
  return { label, background, color };
}

/** 검색어 정리: 공백을 없애고, 끝에 붙은 '역'을 뗀다('강남역' → '강남'). '역' 한 글자만이면 그대로 둔다. */
export function normalizeKeyword(keyword) {
  const compact = String(keyword ?? '').replace(/\s+/g, '');
  return compact.length > 1 && compact.endsWith('역') ? compact.slice(0, -1) : compact;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id));

/**
 * 가나다 순으로 정렬하고, 검색어가 역 이름에 포함된 역만 남긴다. 검색어가 비면 전체.
 * @param {Array} stations data/stations.json
 * @param {string} keyword
 * @returns {Array} 정렬·필터된 역 목록 (없으면 빈 배열 → 화면에서 '검색 결과가 없어요')
 */
export function searchStations(stations, keyword = '') {
  const word = normalizeKeyword(keyword);
  const list = Array.isArray(stations) ? stations : [];
  const found = word ? list.filter((s) => String(s.name ?? '').replace(/\s+/g, '').includes(word)) : [...list];
  return found.sort(byName);
}
