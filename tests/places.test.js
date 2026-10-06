import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeLink, placesFor } from '../src/js/lib/places.js';

// 실행: npm test

const P = (place_id, station_id, purpose, order, extra = {}) => ({ place_id, station_id, purpose, order, name: place_id, ...extra });

test('FUNC-010: 역·목적이 맞는 장소를 order 순으로 최대 3곳', () => {
  const places = [
    P('d', 'S1', '회식', 4), P('b', 'S1', '회식', 2), P('a', 'S1', '회식', 1), P('c', 'S1', '회식', 3),
    P('x', 'S1', '회의', 1), P('y', 'S2', '회식', 1),
  ];
  assert.deepEqual(placesFor(places, 'S1', '회식').map((p) => p.place_id), ['a', 'b', 'c']);
  assert.deepEqual(placesFor(places, 'S2', '회식').map((p) => p.place_id), ['y']); // 3곳 미만이면 있는 만큼
  assert.deepEqual(placesFor(places, 'S3', '회식'), []);
  assert.deepEqual(placesFor(undefined, 'S1', '회식'), []);
});

test('FUNC-010: 실제 데이터에서 목적 3종 × 후보 역마다 장소 3곳이 나온다 (조사분이 적은 역은 있는 만큼, 0곳은 없다)', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
  const places = read('places');
  const candidates = read('candidates');
  const counts = Object.entries(candidates)
    .filter(([purpose]) => purpose !== '기타') // 기타는 장소 추천이 없다(#88)
    .flatMap(([purpose, ids]) => ids.map((id) => [purpose, id, placesFor(places, id, purpose).length]));
  assert.deepEqual(placesFor(places, candidates.기타[0], '기타'), []); // 기타 장소는 데이터에 없다
  assert.deepEqual(counts.filter(([, , n]) => n < 1 || n > 3), []);
  // 3곳이 안 되는 역은 콘텐츠팀 시트(10/6판) 기준으로 여기 적어 둔다. 조사분이 채워지면 지운다
  assert.deepEqual(counts.filter(([, , n]) => n !== 3), [['회식', 'S1266', 2]]); // 디지털미디어시티 회식 2곳
});

test("FUNC-011: '보기' 링크는 kakao_url → naver_url → 카카오맵 검색 순", () => {
  assert.equal(placeLink({ name: '가', kakao_url: 'https://place.map.kakao.com/1', naver_url: 'https://n' }), 'https://place.map.kakao.com/1');
  assert.equal(placeLink({ name: '가', naver_url: 'https://n' }), 'https://n');
  assert.equal(placeLink({ name: '강남역 회식' }), `https://map.kakao.com/link/search/${encodeURIComponent('강남역 회식')}`);
});
