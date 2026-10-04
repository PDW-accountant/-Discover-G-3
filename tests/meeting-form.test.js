import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMeetingRequest, defaultArrival, formatDateInput } from '../src/js/screens/meeting-form.js';

const now = new Date(2026, 9, 4, 12, 0); // 2026-10-04 12:00 (브라우저 시간대 기준)
const ok = { purpose: '회식', date: '2026-10-04', hour: '19', min: '00' };

test('FUNC-021: 목적과 도착 일시가 맞으면 MeetingRequest(purpose, arrival_time)를 만든다', () => {
  const { request, error } = buildMeetingRequest(ok, now);
  assert.equal(error, undefined);
  assert.deepEqual(Object.keys(request).sort(), ['arrival_time', 'purpose']);
  assert.equal(request.purpose, '회식');
  assert.equal(request.arrival_time, new Date(2026, 9, 4, 19, 0).toISOString());
});

test('FUNC-001: 목적은 회식·회의·오락 세 글자 값만 받는다', () => {
  for (const purpose of ['회식', '회의', '오락']) {
    assert.ok(buildMeetingRequest({ ...ok, purpose }, now).request, purpose);
  }
  for (const purpose of [null, undefined, '', '식사', '회식 / 식사', '스터디']) {
    assert.deepEqual(buildMeetingRequest({ ...ok, purpose }, now), { error: 'purpose' }, String(purpose));
  }
});

test('FUNC-001: 도착 일시는 현재 이후만 받는다 (같은 시각도 안 됨)', () => {
  assert.deepEqual(buildMeetingRequest({ ...ok, hour: '11', min: '50' }, now), { error: 'past' });
  assert.deepEqual(buildMeetingRequest({ ...ok, hour: '12', min: '00' }, now), { error: 'past' });
  assert.deepEqual(buildMeetingRequest({ ...ok, date: '2026-10-03' }, now), { error: 'past' });
  assert.ok(buildMeetingRequest({ ...ok, hour: '12', min: '10' }, now).request);
  assert.ok(buildMeetingRequest({ ...ok, date: '2026-10-05', hour: '00', min: '00' }, now).request);
});

test('FUNC-001: 날짜가 비었거나 없는 날짜, 시·분이 목록 밖이면 date 오류', () => {
  for (const bad of [
    { date: '' }, { date: undefined }, { date: '2026/10/05' }, { date: '2026-10-5' },
    { date: '2026-02-30' }, { date: '2026-13-01' },
    { hour: '24' }, { hour: '' }, { min: '07' }, { min: undefined },
  ]) {
    assert.deepEqual(buildMeetingRequest({ ...ok, date: '2026-10-05', ...bad }, now), { error: 'date' }, JSON.stringify(bad));
  }
});

test('FUNC-001: 목적도 날짜도 틀리면 목적부터 알려준다', () => {
  assert.deepEqual(buildMeetingRequest({ purpose: null, date: '', hour: '19', min: '00' }, now), { error: 'purpose' });
});

test('formatDateInput: 날짜 입력칸 값(yyyy-mm-dd)을 브라우저 시간대 기준으로 만든다', () => {
  assert.equal(formatDateInput(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(formatDateInput(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('FUNC-001: 처음 값은 오늘 19:00, 이미 지났으면 내일 19:00 (항상 현재 이후)', () => {
  assert.deepEqual(defaultArrival(new Date(2026, 9, 4, 12, 0)), { date: '2026-10-04', hour: '19', min: '00' });
  assert.deepEqual(defaultArrival(new Date(2026, 9, 4, 19, 0)), { date: '2026-10-05', hour: '19', min: '00' });
  assert.deepEqual(defaultArrival(new Date(2026, 9, 4, 22, 30)), { date: '2026-10-05', hour: '19', min: '00' });
  assert.deepEqual(defaultArrival(new Date(2026, 11, 31, 20, 0)), { date: '2027-01-01', hour: '19', min: '00' });
  for (const base of [new Date(2026, 9, 4, 3, 0), new Date(2026, 9, 4, 23, 59)]) {
    assert.ok(buildMeetingRequest({ purpose: '회식', ...defaultArrival(base) }, base).request, base.toString());
  }
});
