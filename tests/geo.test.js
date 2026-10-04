import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerOf, distanceMeters, estimateTravel } from '../src/js/lib/geo.js';

// 실행: npm test

test('FUNC-005: 두 역 사이 직선거리가 실제 거리와 1% 이내로 맞는다', () => {
  // 위도 1도 ≈ 111.195km (경도가 같을 때)
  const d = distanceMeters({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
  assert.ok(Math.abs(d - 111195) / 111195 < 0.01, `${d}`);
  // 서울역(37.5547, 126.9707) ↔ 시청(37.5657, 126.9769) 약 1.34km
  const city = distanceMeters({ lat: 37.5547, lng: 126.9707 }, { lat: 37.5657, lng: 126.9769 });
  assert.ok(Math.abs(city - 1340) / 1340 < 0.02, `${city}`);
  assert.equal(distanceMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }), 0);
});

test('FUNC-005: 중심 좌표는 위도·경도 평균', () => {
  assert.deepEqual(centerOf([{ lat: 37, lng: 127 }, { lat: 38, lng: 128 }]), { lat: 37.5, lng: 127.5 });
});

test('SFR-020: 같은 역이면 예상 시간 0분, 환승 0, is_estimated=true', () => {
  const s = { id: 'S1', lat: 37.5, lng: 127 };
  assert.deepEqual(estimateTravel(s, s), { minutes: 0, transfers: 0, steps: [], is_estimated: true });
});

test('SFR-020: 예상 시간은 직선거리 ÷ 분속 70m, 올림', () => {
  const a = { id: 'A', lat: 37, lng: 127 };
  const b = { id: 'B', lat: 37.01, lng: 127 }; // 약 1112m → 15.9분 → 16분
  const r = estimateTravel(a, b);
  assert.equal(r.minutes, Math.ceil(distanceMeters(a, b) / 70));
  assert.equal(r.is_estimated, true);
});
