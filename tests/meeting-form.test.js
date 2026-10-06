import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOURS, buildMeetingRequest, defaultArrival, formatDateInput, formatSavedAt, restoreTime } from '../src/js/screens/meeting-form.js';

const now = new Date(2026, 9, 4, 12, 0); // 2026-10-04 12:00 (브라우저 시간대 기준)
const ok = { purpose: '회식', date: '2026-10-04', hour: '19', min: '00' };

test('FUNC-021: 목적과 도착 일시가 맞으면 MeetingRequest(purpose, arrival_time)를 만든다', () => {
  const { request, error } = buildMeetingRequest(ok, now);
  assert.equal(error, undefined);
  assert.deepEqual(Object.keys(request).sort(), ['arrival_time', 'purpose']);
  assert.equal(request.purpose, '회식');
  assert.equal(request.arrival_time, new Date(2026, 9, 4, 19, 0).toISOString());
});

test("FUNC-001: 목적은 회식·회의·오락·기타(#88) 네 값만 받는다", () => {
  for (const purpose of ['회식', '회의', '오락', '기타']) {
    assert.ok(buildMeetingRequest({ ...ok, purpose }, now).request, purpose);
  }
  for (const purpose of [null, undefined, '', '식사', '회식 / 식사', '스터디', '역만 찾기', 'etc']) {
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

test("FUNC-019: '이어서 입력할까요?'의 저장 시각은 오늘이면 시:분, 아니면 날짜까지", () => {
  assert.equal(formatSavedAt(new Date(2026, 9, 4, 9, 5).toISOString(), now), '09:05');
  assert.equal(formatSavedAt(new Date(2026, 9, 3, 19, 20).toISOString(), now), '10월 3일 19:20');
  assert.equal(formatSavedAt('잘못된 값', now), '');
});

test('#71: 시 목록에 지하철이 없는 새벽 01~05시가 없다 (0시는 남긴다)', () => {
  assert.deepEqual(HOURS, ['00', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']);
});

test('#71: 새벽 01~05시 도착은 거부하고, 0시·6시는 받는다', () => {
  for (const hour of ['01', '02', '03', '04', '05']) {
    assert.deepEqual(buildMeetingRequest({ ...ok, date: '2026-10-05', hour }, now), { error: 'date' }, hour);
  }
  for (const hour of ['00', '06']) {
    assert.ok(buildMeetingRequest({ ...ok, date: '2026-10-05', hour }, now).request, hour);
  }
});

test('#71: 되살린 시각(임시저장·뒤로 가기)이 새벽 01~05시면 19:00으로 바꾸고 알린다. 날짜·목적은 그대로', () => {
  for (const hour of ['01', '02', '03', '04', '05']) {
    assert.deepEqual(
      restoreTime({ purpose: '회식', date: '2026-10-07', hour, min: '30' }),
      { form: { purpose: '회식', date: '2026-10-07', hour: '19', min: '00' }, hourReset: true },
      hour,
    );
  }
});

test('#71: 되살린 시각이 고를 수 있는 시각이면 그대로 둔다', () => {
  for (const hour of ['00', '06', '19', '23']) {
    const form = { purpose: '회의', date: '2026-10-07', hour, min: '40' };
    assert.deepEqual(restoreTime(form), { form, hourReset: false }, hour);
  }
});
