import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LINE_BADGES, lineBadge, normalizeKeyword, rareServiceNotices, searchStations } from '../src/js/lib/stations.js';

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

test("FUNC-002: '강남' 검색 시 이름에 '강남'이 들어간 역만 나온다", () => {
  assert.deepEqual(names(searchStations(stations, '강남')), ['강남', '강남구청']);
  assert.deepEqual(names(searchStations(stations, '입구')), ['을지로입구', '홍대입구']);
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
