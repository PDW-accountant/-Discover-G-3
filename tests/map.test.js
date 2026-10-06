import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LABEL_GAP_PX, drawRoute, labelSide, lineColor, loadMapSdk, routePoints, routeSegments, routeStops, visibleLabels } from '../src/js/lib/map.js';
import { lineBadge } from '../src/js/lib/stations.js';

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
  assert.equal((box.innerHTML.match(/<circle/g) ?? []).length, 4); // 중간 역 1 + 출발 1 + 도착 2(테두리·가운데)
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

test('#16: 경로선은 구간에서 열차가 서는 역(via)을 따라 그린다', () => {
  const samsung = st('삼성', 37.5089, 127.0631);
  const steps = [{ line: '2', from, to, minutes: 12, via: [from, samsung, mid, to] }];
  assert.deepEqual(routePoints({ from, to, steps }).map((p) => p.id), ['잠실', '삼성', '선릉', '강남']);
});

test('#16: 키가 없거나 브라우저가 아니면 카카오 지도 SDK를 부르지 않고 false (SVG 약도 유지)', async () => {
  assert.equal(await loadMapSdk({ key: '' }), false);
  assert.equal(await loadMapSdk({ key: 'k', doc: undefined, win: undefined }), false); // Node (검사 환경)
});

test('#16: SDK 스크립트를 불러오지 못하면(등록 안 한 도메인·네트워크) false', async () => {
  const head = { append: (script) => setTimeout(() => script.onerror(), 0) };
  const doc = { createElement: () => ({}), head };
  assert.equal(await loadMapSdk({ key: 'k', doc, win: {} }), false);
});

// ---------- #74: 구간별 노선 색 ----------

const sadang = st('사당', 37.4765, 126.9816);
const chungmuro = st('충무로', 37.5613, 126.9941);
const euljiro3 = st('을지로3가', 37.5663, 126.9917);
const transferTrip = {
  from: sadang, to: euljiro3,
  steps: [
    { line: '4', from: sadang, to: chungmuro, minutes: 21, via: [sadang, st('총신대입구', 37.4870, 126.9820), chungmuro] },
    { line: '3', from: chungmuro, to: euljiro3, minutes: 1, via: [chungmuro, euljiro3] },
  ],
};

test('#74: 노선 색은 호선 동그라미(LINE_BADGES)와 같고, 모르는 노선은 회색, 노선이 없으면 앱 강조색', () => {
  assert.equal(lineColor('4'), lineBadge('4').background);
  assert.equal(lineColor('신분당'), '#D4003B');
  assert.equal(lineColor('없는노선'), '#8c959f');
  assert.equal(lineColor(null), '#D9512C');
});

test('#74: 구간마다 { line, color, points } — 환승역에서 앞 구간 끝과 다음 구간 시작이 같은 역', () => {
  const segs = routeSegments(transferTrip);
  assert.deepEqual(segs.map((s) => [s.line, s.color, s.points.map((p) => p.id)]), [
    ['4', lineBadge('4').background, ['사당', '총신대입구', '충무로']],
    ['3', lineBadge('3').background, ['충무로', '을지로3가']],
  ]);
  assert.deepEqual(routeStops(segs).map((s) => [s.kind, s.station.id, s.color]), [
    ['from', '사당', lineBadge('4').background], ['transfer', '충무로', lineBadge('3').background], ['to', '을지로3가', lineBadge('3').background],
  ]);
  assert.deepEqual(routeStops(segs).map((s) => s.neighbors.map((n) => n.id)), [['총신대입구'], ['총신대입구', '을지로3가'], ['충무로']]); // 이름표를 선 반대쪽에 두려고
});

test('#74: 이름표는 선 반대쪽 — 선이 점에서 위로 뻗으면 아래, 아래로 뻗으면 위, 이웃이 없으면 위', () => {
  assert.equal(labelSide({ x: 0, y: 100 }, [{ x: 0, y: 20 }]), 'below');            // 선이 위로
  assert.equal(labelSide({ x: 0, y: 100 }, [{ x: 0, y: 180 }]), 'above');           // 선이 아래로
  assert.equal(labelSide({ x: 0, y: 100 }, [{ x: -50, y: 20 }, { x: 50, y: 60 }]), 'below'); // 환승: 양쪽 다 위
  assert.equal(labelSide({ x: 0, y: 100 }, [{ x: -50, y: 20 }, { x: 50, y: 200 }]), 'above'); // 평균이 아래
  assert.equal(labelSide({ x: 0, y: 100 }, [undefined]), 'above');
});

test('#74: 구간이 없으면(직선거리 대체) 출발 → 도착 한 구간, 좌표 없는 역은 빼고, 마지막 구간은 만남 역에서 끝난다', () => {
  assert.deepEqual(routeSegments({ from, to, steps: [] }).map((s) => [s.line, s.points.map((p) => p.id)]), [[null, ['잠실', '강남']]]);
  assert.deepEqual(routeSegments({ from, to, steps: [{ line: '2', from, to: mid }] })[0].points.map((p) => p.id), ['잠실', '선릉', '강남']);
  assert.deepEqual(routeSegments({ from, to, steps: [{ line: '2', from, to: { id: 'X' } }] })[0].points.map((p) => p.id), ['잠실', '강남']);
  assert.equal(routeSegments({ from: { id: 'X' }, to }), null);
  assert.deepEqual(routeSegments({ from, to: from, steps: [] }), []);
});

test('#74: SVG 약도는 구간마다 흰 테두리 선 + 노선 색 실선, 환승역에 점과 이름표', () => {
  const box = { innerHTML: '' };
  assert.equal(drawRoute(box, transferTrip), true);
  const colored = [...box.innerHTML.matchAll(/<polyline [^>]*stroke="(#[0-9A-Fa-f]{6})" stroke-width="5"/g)].map((m) => m[1]);
  assert.deepEqual(colored, [lineBadge('4').background, lineBadge('3').background]); // 4호선 파랑 → 3호선 주황
  assert.equal((box.innerHTML.match(/stroke="#fff" stroke-width="9"/g) ?? []).length, 2); // 구간마다 흰 테두리 선
  assert.doesNotMatch(box.innerHTML, /stroke-dasharray/); // 점선 아님
  assert.match(box.innerHTML, /route\.mapTransfer/); // 환승 이름표(검사 환경에는 copy.json이 없어 키 이름이 보인다)
  assert.match(box.innerHTML, /paint-order="stroke"/); // 글씨에 흰 외곽선
});

test('#74: 이름표 겹침 — 출발·도착은 항상, 환승은 가까운 이름표가 있으면 글씨를 숨긴다', () => {
  const far = [{ kind: 'from', x: 0, y: 0 }, { kind: 'transfer', x: 100, y: 0 }, { kind: 'to', x: 200, y: 0 }];
  assert.deepEqual(visibleLabels(far), [true, true, true]);
  const near = [{ kind: 'from', x: 0, y: 0 }, { kind: 'transfer', x: 190, y: 0 }, { kind: 'to', x: 200, y: 0 }];
  assert.deepEqual(visibleLabels(near), [true, false, true]); // 도착과 10px 차이 → 숨김
  const twoTransfers = [{ kind: 'from', x: 0, y: 0 }, { kind: 'transfer', x: 100, y: 0 }, { kind: 'transfer', x: 120, y: 0 }, { kind: 'to', x: 300, y: 0 }];
  assert.deepEqual(visibleLabels(twoTransfers), [true, true, false, true]); // 앞 환승과 가까운 뒤 환승만 숨김
  assert.deepEqual(visibleLabels(near, 5), [true, true, true]); // 간격 기준을 줄이면 보인다
  assert.equal(LABEL_GAP_PX, 40);
});
