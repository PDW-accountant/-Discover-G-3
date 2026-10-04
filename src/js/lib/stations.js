// 출발역 목록 정렬·검색 (개발 A) — FUNC-002
// Station: { id, name, lines[], lat, lng, seoul, trains_per_day? } (data/stations.json). 수도권 지하철역 전체(서울 밖 역 포함, 10/4 변경. seoul은 서울 여부 참고용).
// name에는 끝의 '역'이 없다('서울역'도 '서울'). 화면은 copy.json의 '{name}역'으로 붙여 쓴다.
// trains_per_day: 열차가 하루 몇 번만 다니는 역에만 있다(예: 임진강·운천 2회). 화면은 rareServiceNotices로 경고한다.

import { t } from './data.js';

// 호선 표시: [동그라미 안 글자, 노선 색, 글자 색]. 목록에 없는 호선은 이름 그대로 회색으로 보여준다.
// 화면(join.js, participants.js, route.js)은 이 목록만 쓴다(lineBadge).
export const LINE_BADGES = {
  1: ['1', '#0052A4', '#fff'], 2: ['2', '#00A84D', '#fff'], 3: ['3', '#EF7C1C', '#fff'], 4: ['4', '#00A5DE', '#fff'],
  5: ['5', '#996CAC', '#fff'], 6: ['6', '#CD7C2F', '#fff'], 7: ['7', '#747F00', '#fff'], 8: ['8', '#E6186C', '#fff'],
  9: ['9', '#BDB092', '#000'],
  신분당: ['신분', '#D4003B', '#fff'], 공항철도: ['공항', '#0090D2', '#fff'], 경의중앙: ['경의', '#77C4A3', '#000'],
  수인분당: ['수인', '#F5A200', '#000'], 신림: ['신림', '#6789CA', '#fff'], 우이신설: ['우이', '#B0CE18', '#000'],
  경춘: ['경춘', '#0C8E72', '#fff'],
  // 수도권 확장(10/4)으로 들어온 노선. 글자·색은 임시값이라 콘텐츠팀 확인 후 바꾼다
  인천1: ['인1', '#7CA8D5', '#000'], 인천2: ['인2', '#ED8B00', '#000'], 에버라인: ['에버', '#6FB245', '#000'],
  김포골드: ['김포', '#A17800', '#fff'], 경강: ['경강', '#0054A6', '#fff'], 의정부: ['의정', '#FDA600', '#000'],
  서해: ['서해', '#81A914', '#000'], 'GTX-A': ['GTX', '#9A6292', '#fff'],
};

/** 호선 하나의 표시값. @returns {{label, background, color}} */
export function lineBadge(line) {
  const [label, background, color] = LINE_BADGES[line] ?? [String(line), '#8c959f', '#fff'];
  return { label, background, color };
}

/**
 * 열차가 하루 몇 번만 다니는 역(trains_per_day)의 경고 문구. 같은 역은 한 번만, 없는 역(null)은 건너뛴다.
 * @param {Array<Station|null|undefined>} stations 고른 출발역·만남 역 등
 * @returns {string[]} '임진강역은 열차가 하루 2회만 다녀요. …'
 */
export function rareServiceNotices(stations = []) {
  const seen = new Set();
  return stations
    .filter((s) => s?.trains_per_day && !seen.has(s.id) && seen.add(s.id))
    .map((s) => t('station.rareService', { name: s.name, count: s.trains_per_day }));
}

/** 검색어 정리: 공백을 없애고, 끝에 붙은 '역'을 뗀다('강남역' → '강남'). '역' 한 글자만이면 그대로 둔다. */
export function normalizeKeyword(keyword) {
  const compact = String(keyword ?? '').replace(/\s+/g, '');
  return compact.length > 1 && compact.endsWith('역') ? compact.slice(0, -1) : compact;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'ko') || String(a.id).localeCompare(String(b.id));

// 한글 초성(자음) 19개 — 완성 글자 코드에서 초성 번호로 찾는다
const CHOSEONG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/** 완성 글자의 초성('강' → 'ㄱ'). 한글 완성 글자가 아니면 null. */
export function initialOf(char) {
  const code = char.codePointAt(0);
  if (code < SYLLABLE_FIRST || code > SYLLABLE_LAST) return null;
  return CHOSEONG[Math.floor((code - SYLLABLE_FIRST) / (21 * 28))];
}

/** 검색어의 한 글자가 역 이름의 같은 자리 글자와 맞는지: 자음만 쓰면 초성 비교('ㄱ' ↔ '강'), 그 밖은 같은 글자(영문은 대소문자 무시). */
function charMatches(typed, actual) {
  if (actual === undefined) return false;
  if (CHOSEONG.includes(typed)) return typed === actual || initialOf(actual) === typed;
  return typed.toLowerCase() === actual.toLowerCase();
}

/** 역 이름(공백 제외)이 검색어로 시작하는지. 글자마다 charMatches. */
export function startsWithKeyword(name, word) {
  const actual = [...String(name ?? '').replace(/\s+/g, '')];
  return [...word].every((typed, i) => charMatches(typed, actual[i]));
}

/**
 * 가나다 순으로 정렬하고, 역 이름이 검색어로 **시작하는** 역만 남긴다(10/4 대원 요청). 검색어가 비면 전체.
 * 'ㄱ' → 첫 글자가 ㄱ으로 시작하는 역(강남·광화문…), '가' → 첫 글자가 '가'인 역(가산디지털단지·가양…), 'ㄱㄴ'·'강ㄴ' → 강남.
 * @param {Array} stations data/stations.json
 * @param {string} keyword
 * @returns {Array} 정렬·필터된 역 목록 (없으면 빈 배열 → 화면에서 '검색 결과가 없어요')
 */
export function searchStations(stations, keyword = '') {
  const word = normalizeKeyword(keyword);
  const list = Array.isArray(stations) ? stations : [];
  const found = word ? list.filter((s) => startsWithKeyword(s.name, word)) : [...list];
  return found.sort(byName);
}
