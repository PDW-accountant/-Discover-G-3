import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test("FUNC-011: '보기' 링크는 kakao_url → naver_url → 카카오맵 검색 순", () => {
  assert.equal(placeLink({ name: '가', kakao_url: 'https://place.map.kakao.com/1', naver_url: 'https://n' }), 'https://place.map.kakao.com/1');
  assert.equal(placeLink({ name: '가', naver_url: 'https://n' }), 'https://n');
  assert.equal(placeLink({ name: '강남역 회식' }), `https://map.kakao.com/link/search/${encodeURIComponent('강남역 회식')}`);
});
