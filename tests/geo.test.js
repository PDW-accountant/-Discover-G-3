import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, estimateTravel } from '../src/js/lib/geo.js';
import { ESTIMATE_METERS_PER_MINUTE } from '../src/js/config.js';

// 구현하면서 test.todo를 실제 테스트로 바꿉니다. 실행: npm test

test('FUNC-005: 두 역 사이 직선거리가 실제 거리와 1% 이내로 맞는다', () => {
  // 경도가 같고 위도 1도 차이 ≈ 111.2km
  const d = distanceMeters({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
  assert.ok(Math.abs(d - 111195) / 111195 < 0.01, `${d}m`);
});

test('SFR-020: 같은 역이면 예상 시간 0분, 환승 0, is_estimated=true', () => {
  const s = { id: 'S1', lat: 37.5, lng: 127 };
  assert.deepEqual(estimateTravel(s, s), { minutes: 0, transfers: 0, steps: [], is_estimated: true });
});

test('SFR-020: 예상 시간 = 직선거리 ÷ 분속, 분 단위 올림', () => {
  const from = { id: 'A', lat: 37, lng: 127 }, to = { id: 'B', lat: 38, lng: 127 };
  assert.equal(estimateTravel(from, to).minutes, Math.ceil(distanceMeters(from, to) / ESTIMATE_METERS_PER_MINUTE));
});
