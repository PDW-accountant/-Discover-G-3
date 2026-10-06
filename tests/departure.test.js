import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData } from '../src/js/lib/data.js';
import { BUFFER_MINUTES, countTransfers, departureAdvice, lineName, routeSummary } from '../src/js/lib/departure.js';

// 실행: npm test

// 요약 문구를 data/copy.json에서 읽도록, 화면처럼 loadData()로 문구를 불러 둔다.
before(async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(`../${url}`, import.meta.url);
    const body = String(url).endsWith('copy.json') ? await readFile(path, 'utf8') : '{}';
    return { json: async () => JSON.parse(body) };
  };
  try { await loadData(); } finally { globalThis.fetch = original; }
});

const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);
const hhmm = (date) => `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

test('FUNC-025: 여유 시간은 10분 (상수 하나)', () => {
  assert.equal(BUFFER_MINUTES, 10);
});

test('FUNC-025: 18:00 도착 · 24분 → 17:26', () => {
  const { depart_at: departAt } = departureAdvice(at(2026, 10, 5, 18, 0), 24, [], at(2026, 10, 5, 12, 0));
  assert.equal(hhmm(departAt), '17:26');
  assert.equal(departAt.getDate(), 5);
});

test('FUNC-025: 자정 전후로 날짜가 바뀌어도 맞게 계산된다', () => {
  const night = departureAdvice(at(2026, 10, 6, 0, 10), 25, [], at(2026, 10, 5, 12, 0));
  assert.equal(hhmm(night.depart_at), '23:35');
  assert.equal(night.depart_at.getDate(), 5); // 전날
  const month = departureAdvice(at(2026, 11, 1, 0, 5), 40, [], at(2026, 10, 1, 0, 0));
  assert.equal(month.depart_at.getMonth(), 9); // 10월 31일
  assert.equal(month.depart_at.getDate(), 31);
  assert.equal(hhmm(month.depart_at), '23:15');
});

test('#86: 역 → 장소 도보 분을 받으면 장소 도착 기준 — 18:00 도착 · 지하철 24분 · 도보 6분 → 17:20', () => {
  const advice = departureAdvice(at(2026, 10, 5, 18, 0), 24, [], at(2026, 10, 5, 12, 0), 6);
  assert.equal(hhmm(advice.depart_at), '17:20');
});

test('#86: 도보 분이 없거나 이상하면 지금과 같다(역 도착 기준)', () => {
  const arrival = at(2026, 10, 5, 18, 0);
  for (const walk of [undefined, null, NaN, -3]) {
    assert.equal(hhmm(departureAdvice(arrival, 24, [], at(2026, 10, 5, 12, 0), walk).depart_at), '17:26');
  }
});

test('FUNC-025: 이미 지난 시각이면 is_past = true', () => {
  const arrival = at(2026, 10, 5, 18, 0); // 출발 17:26
  assert.equal(departureAdvice(arrival, 24, [], at(2026, 10, 5, 17, 0)).is_past, false);
  assert.equal(departureAdvice(arrival, 24, [], at(2026, 10, 5, 17, 26)).is_past, false); // 딱 그 시각은 아직
  assert.equal(departureAdvice(arrival, 24, [], at(2026, 10, 5, 17, 27)).is_past, true);
});

test('FUNC-025: 분 단위로 내림, 소요시간이 비었거나 이상하면 0분으로 본다', () => {
  const arrival = at(2026, 10, 5, 18, 0);
  assert.equal(hhmm(departureAdvice(arrival, 24.5).depart_at), '17:25');
  assert.equal(departureAdvice(new Date(2026, 9, 5, 18, 0, 30), 24).depart_at.getSeconds(), 0);
  for (const bad of [undefined, null, NaN, -5]) assert.equal(hhmm(departureAdvice(arrival, bad).depart_at), '17:50');
});

test('FUNC-025: 도착 시각은 ISO 문자열도 받고, 올바르지 않으면 예외', () => {
  const iso = at(2026, 10, 5, 18, 0).toISOString();
  assert.equal(hhmm(departureAdvice(iso, 24).depart_at), '17:26');
  assert.throws(() => departureAdvice('아무거나', 24));
});

test('FUNC-025: 이동 방법 요약 — 첫 노선과 환승 횟수', () => {
  const steps = [
    { line: '3', from: 'S1', to: 'S2', minutes: 10 },
    { line: '2', from: 'S2', to: 'S3', minutes: 8 },
  ];
  assert.equal(countTransfers(steps), 1);
  assert.equal(departureAdvice(at(2026, 10, 5, 18, 0), 24, steps).summary, '3호선 승차 · 환승 1회');
  assert.equal(routeSummary([{ line: '신분당' }]), '신분당선 승차 · 환승 없음');
  // 같은 호선이 이어지면 환승이 아니다
  assert.equal(routeSummary([{ line: '2' }, { line: '2' }, { line: '9' }]), '2호선 승차 · 환승 1회');
});

test('FUNC-025: 구간 정보가 없으면(예상 시간) 요약은 빈 문자열', () => {
  assert.equal(departureAdvice(at(2026, 10, 5, 18, 0), 24).summary, '');
  assert.equal(routeSummary(undefined), '');
});

test('FUNC-025: 호선 이름', () => {
  assert.equal(lineName('2'), '2호선');
  assert.equal(lineName('경의중앙'), '경의중앙선');
  assert.equal(lineName('공항철도'), '공항철도');
  assert.equal(lineName('우이신설선'), '우이신설선');
});
