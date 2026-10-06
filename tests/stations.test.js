import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LINE_BADGES, MIDDLE_MATCH_MIN_LENGTH, includesKeyword, initialOf, lineBadge, matchesAt, normalizeKeyword, rareServiceNotices,
  searchStations, startsWithKeyword,
} from '../src/js/lib/stations.js';

// 실행: npm test

const station = (id, name, lines) => ({ id, name, lines, lat: 37.5, lng: 127 });
const stations = [
  station('S1', '홍대입구', ['2', '공항철도', '경의중앙']),
  station('S2', '강남구청', ['7', '수인분당']),
  station('S3', '종로3가', ['1', '3', '5']),
  station('S4', '강남', ['2', '신분당']),
  station('S5', '을지로입구', ['2']),
  station('S6', '신논현', ['9', '신분당']),
];
const names = (list) => list.map((s) => s.name);

test('FUNC-002: 검색어가 없으면 가나다 순 전체 목록', () => {
  assert.deepEqual(names(searchStations(stations)), ['강남', '강남구청', '신논현', '을지로입구', '종로3가', '홍대입구']);
  assert.deepEqual(names(searchStations(stations, '')), names(searchStations(stations)));
  assert.deepEqual(names(searchStations(stations, '   ')), names(searchStations(stations)));
});

test("#72: '강남' → 강남·강남구청(첫 글자 일치)이 위에, 이름 중간에 '강남'이 든 역이 아래에", () => {
  const more = [...stations, station('S9', '신강남', ['9']), station('S10', '가강남시장', ['1'])];
  assert.deepEqual(names(searchStations(more, '강남')), ['강남', '강남구청', '가강남시장', '신강남']);
  assert.deepEqual(names(searchStations(stations, '입구')), ['을지로입구', '홍대입구']); // 중간·끝 글자로도 찾는다
  assert.deepEqual(names(searchStations(stations, '구청')), ['강남구청']);
});

test("#72: '벤처'·자음 'ㅂㅊ' → 서울대벤처타운 (예전에는 '서울대'부터 쳐야 나왔다)", () => {
  const more = [...stations, station('S11', '서울대벤처타운', ['신림']), station('S12', '봉천', ['2'])];
  assert.deepEqual(names(searchStations(more, '벤처')), ['서울대벤처타운']);
  assert.deepEqual(names(searchStations(more, 'ㅂㅊ')), ['봉천', '서울대벤처타운']); // 첫 글자 일치(봉천) 다음에 중간 일치
  assert.deepEqual(names(searchStations(more, '벤처역')), ['서울대벤처타운']);   // 끝의 '역'은 그대로 무시
});

test(`#72: 한 글자(${MIDDLE_MATCH_MIN_LENGTH}글자 미만) 검색은 지금처럼 첫 글자 일치만`, () => {
  const more = [...stations, station('S9', '신강남', ['9'])];
  assert.equal(MIDDLE_MATCH_MIN_LENGTH, 2);
  assert.deepEqual(names(searchStations(more, '강')), ['강남', '강남구청']); // '신강남'은 나오지 않는다
  assert.deepEqual(names(searchStations(more, 'ㄴ')), []);                   // 중간에 ㄴ이 있는 역도 나오지 않는다
  assert.deepEqual(names(searchStations(more, '구')), []);
});

test('#72: 첫 글자 일치에 든 역은 중간 일치에 다시 넣지 않는다 (중복 없음)', () => {
  const more = [...stations, station('S13', '강남강남', ['2'])]; // 처음과 중간에 모두 맞는 이름
  const found = searchStations(more, '강남');
  assert.equal(new Set(found).size, found.length);
  assert.deepEqual(names(found), ['강남', '강남강남', '강남구청']);
});

test('#72: matchesAt·includesKeyword — 어느 자리에서든, 자음은 초성으로, 공백은 무시', () => {
  assert.equal(matchesAt('서울대벤처타운', '벤처', 3), true);
  assert.equal(matchesAt('서울대벤처타운', '벤처', 2), false);
  assert.equal(matchesAt('강남', '강남구', 0), false); // 이름보다 긴 검색어
  assert.equal(includesKeyword('서울대벤처타운', '벤처'), true);
  assert.equal(includesKeyword('서울대벤처타운', 'ㅂㅊ'), true);
  assert.equal(includesKeyword('서울대벤처타운', '타운'), true);  // 끝 글자
  assert.equal(includesKeyword('서울대벤처타운', '처벤'), false);
  assert.equal(includesKeyword('종로 3가', '로3'), true);        // 이름 안 공백 무시
  assert.equal(includesKeyword('강남', '강남구청'), false);
  assert.equal(startsWithKeyword('서울대벤처타운', '벤처'), false); // 기존 첫 글자 비교는 그대로
});

test("FUNC-002: 자음만 치면 그 자음으로 시작하는 역, 완성 글자를 치면 그 글자로 시작하는 역만 (10/4)", () => {
  const more = [...stations, station('S7', '가산디지털단지', ['1', '7']), station('S8', '광화문', ['5'])];
  assert.deepEqual(names(searchStations(more, 'ㄱ')), ['가산디지털단지', '강남', '강남구청', '광화문']);
  assert.deepEqual(names(searchStations(more, '가')), ['가산디지털단지']); // '강남'의 첫 글자는 '가'가 아니다
  assert.deepEqual(names(searchStations(more, '강')), ['강남', '강남구청']);
  assert.deepEqual(names(searchStations(more, 'ㄱㄴ')), ['강남', '강남구청']);   // 글자마다 초성
  assert.deepEqual(names(searchStations(more, '강ㄴ')), ['강남', '강남구청']);  // 완성 글자 + 초성 섞기
  assert.deepEqual(names(searchStations(more, 'ㅎㄷ')), ['홍대입구']);
  assert.deepEqual(names(searchStations(more, 'ㅈㄹ3')), ['종로3가']);
  assert.deepEqual(names(searchStations(more, 'ㄴ')), []);
});

test('FUNC-002: 완성 글자의 초성', () => {
  assert.equal(initialOf('강'), 'ㄱ');
  assert.equal(initialOf('홍'), 'ㅎ');
  assert.equal(initialOf('빠'), 'ㅃ');
  assert.equal(initialOf('ㄱ'), null);
  assert.equal(initialOf('A'), null);
});

test("FUNC-002: 앞뒤 공백·끝의 '역'은 무시한다", () => {
  assert.deepEqual(names(searchStations(stations, ' 강남역 ')), ['강남', '강남구청']);
  assert.deepEqual(names(searchStations(stations, '종로 3가')), ['종로3가']);
  assert.equal(normalizeKeyword('역'), '역');
});

test('FUNC-002: 검색 결과가 없으면 빈 배열', () => {
  assert.deepEqual(searchStations(stations, '부산'), []);
  assert.deepEqual(searchStations([], '강남'), []);
  assert.deepEqual(searchStations(undefined), []);
});

test('FUNC-002: 역 정보는 그대로 돌려주고 원래 목록은 바꾸지 않는다', () => {
  const before = names(stations);
  const [first] = searchStations(stations, '강남');
  assert.equal(first, stations[3]); // 같은 Station 객체 { id, name, lines, lat, lng }
  assert.deepEqual(names(stations), before);
});

test('FUNC-002: 환승역 호선 표시값', () => {
  assert.deepEqual(lineBadge('2'), { label: '2', background: '#00A84D', color: '#fff' });
  assert.equal(lineBadge('신분당').label, '신분');
  assert.equal(lineBadge('없는노선').label, '없는노선'); // 표에 없는 호선은 이름 그대로
});

test('FUNC-002: 하루 몇 번만 다니는 역(trains_per_day)만 경고 문구를 만든다, 같은 역은 한 번만', () => {
  const rare = { id: 'S1285', name: '임진강', lines: ['경의중앙'], trains_per_day: 2 };
  assert.equal(rareServiceNotices([rare, stations[0], null, undefined, rare]).length, 1);
  assert.deepEqual(rareServiceNotices([stations[0]]), []);
  assert.deepEqual(rareServiceNotices(), []);
});

test('FUNC-002: data/stations.json의 모든 호선에 동그라미 표시값이 있다 (3글자 이내)', () => {
  const all = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
  const missing = [...new Set(all.flatMap((s) => s.lines))].filter((line) => !(line in LINE_BADGES) || LINE_BADGES[line][0].length > 3);
  assert.deepEqual(missing, []);
});

test('#72 완료 조건: 실제 역 데이터(data/stations.json)', () => {
  const all = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
  assert.ok(names(searchStations(all, '벤처')).includes('서울대벤처타운'));
  const gangnam = names(searchStations(all, '강남'));
  assert.deepEqual(gangnam.slice(0, 2), ['강남', '강남구청']); // 첫 글자 일치가 맨 위
  const middleStart = gangnam.findIndex((n) => !n.startsWith('강남'));
  if (middleStart >= 0) assert.ok(gangnam.slice(middleStart).every((n) => !n.startsWith('강남')), '중간 일치는 첫 글자 일치 아래에만');
  assert.ok(searchStations(all, 'ㄱ').every((s) => initialOf(s.name[0]) === 'ㄱ' || s.name[0] === 'ㄱ'), "'ㄱ'은 첫 글자가 ㄱ인 역만");
  const ipgu = names(searchStations(all, '입구'));
  assert.ok(ipgu.includes('홍대입구') && ipgu.includes('을지로입구'));
});

test('#72: 역 655개에서 검색이 디바운스 없이도 충분히 빠르다', () => {
  const all = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
  const started = performance.now();
  for (const word of ['ㄱ', '강', '강남', '입구', 'ㅂㅊ', '서울대벤처타운', '없는역이름']) searchStations(all, word);
  assert.ok(performance.now() - started < 200, '7번 검색이 0.2초 안');
});
