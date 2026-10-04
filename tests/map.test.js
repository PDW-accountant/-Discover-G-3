import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawRoute, routePoints } from '../src/js/lib/map.js';

// 실행: npm test

const st = (id, lat, lng) => ({ id, name: id, lines: ['2'], lat, lng });
const from = st('잠실', 37.5133, 127.1001);
const mid = st('선릉', 37.5045, 127.0490);
const to = st('강남', 37.4979, 127.0276);

test('FUNC-015: 경로선 점은 출발역 → 구간 하차역 → 만남 역 순서, 같은 역이 이어지면 하나로', () => {
  const steps = [{ line: '2', from, to: mid, minutes: 8 }, { line: '2', from: mid, to, minutes: 5 }];
  assert.deepEqual(routePoints({ from, to, steps }).map((p) => p.id), ['잠실', '선릉', '강남']);
  assert.deepEqual(routePoints({ from, to }).map((p) => p.id), ['잠실', '강남']);
});

test('FUNC-015: 좌표가 없는 경유 역은 빼고, 출발·도착 좌표가 없으면 null', () => {
  const noCoords = { id: 'X', name: 'X' };
  assert.deepEqual(routePoints({ from, to, steps: [{ to: noCoords }] }).map((p) => p.id), ['잠실', '강남']);
  assert.equal(routePoints({ from: noCoords, to }), null);
  assert.equal(routePoints({ from, to: noCoords }), null);
});

test('FUNC-015: drawRoute는 출발·도착 점과 경로선을 SVG로 그리고 true', () => {
  const box = { innerHTML: '' };
  assert.equal(drawRoute(box, { from, to, steps: [{ line: '2', from, to: mid, minutes: 8 }] }), true);
  assert.match(box.innerHTML, /<svg class="map"/);
  assert.match(box.innerHTML, /<polyline points="[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+"/); // 점 3개를 직선으로
  assert.equal((box.innerHTML.match(/<circle/g) ?? []).length, 4); // 경유 1 + 출발 1 + 도착 2(테두리·가운데)
});

test('FUNC-015: 그릴 수 없으면 false (화면은 카카오맵 링크로 대신)', () => {
  const box = { innerHTML: '' };
  assert.equal(drawRoute(box, { from: { id: 'X', name: 'X' }, to, steps: [] }), false);
  assert.equal(drawRoute(box, { from: to, to, steps: [] }), false); // 같은 역이면 선이 없다
  assert.equal(drawRoute(null, { from, to, steps: [] }), false);
  assert.equal(box.innerHTML, '');
});

test('FUNC-015: 역 이름에 특수문자가 있어도 SVG가 깨지지 않는다', () => {
  const box = { innerHTML: '' };
  drawRoute(box, { from: { ...from, name: '<a&"b>' }, to, steps: [] });
  assert.doesNotMatch(box.innerHTML, /<a&/);
});
