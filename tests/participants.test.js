import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canFind, newParticipant, participantsSignature, progressOf, trackChange } from '../src/js/screens/participants.js';
import { POLL_STOP_AFTER_MS } from '../src/js/config.js';

const row = (station) => ({ participant_id: 'p_x', nickname: '', origin_station_id: station });
const person = (id, station = 'S1', updatedAt = 'T1', nickname = '감이') => ({ participant_id: id, nickname, origin_station_id: station, updated_at: updatedAt });

test('FUNC-023: 입력 현황은 "n명 중 m명"이고 n은 최소 인원(3)보다 작지 않다', () => {
  assert.deepEqual(progressOf([]), { done: 0, total: 3 });
  assert.deepEqual(progressOf([row('S1')]), { done: 1, total: 3 });
  assert.deepEqual(progressOf([row('S1'), row('S2'), row(null)]), { done: 2, total: 3 });
  assert.deepEqual(progressOf([row('S1'), row('S2'), row('S3'), row('S4')]), { done: 4, total: 4 });
  assert.deepEqual(progressOf([row('S1'), row(null), row(''), row('S2'), row('S3')]), { done: 3, total: 5 }); // 빈 값은 입력 전
});

test('FUNC-023: 3명 이상이고 모두 출발역이 있어야 찾기가 켜진다', () => {
  assert.equal(canFind([row('S1'), row('S2'), row('S3')]), true);
  assert.equal(canFind([row('S1'), row('S2')]), false);                    // 3명 미만
  assert.equal(canFind([row('S1'), row('S2'), row(null)]), false);          // 출발역 없는 줄
  assert.equal(canFind([]), false);
  const nine = Array.from({ length: 9 }, () => row('S1'));
  assert.equal(canFind(nine), true);
  assert.equal(canFind([...nine, row('S1')]), false);                      // 9명 초과
});

test('FUNC-023: 총무가 아니거나 이미 확정된 방은 찾기를 켤 수 없다 (보기만)', () => {
  const ok = [row('S1'), row('S2'), row('S3')];
  assert.equal(canFind(ok, { isHost: true, confirmed: false }), true);
  assert.equal(canFind(ok, { isHost: false }), false);
  assert.equal(canFind(ok, { confirmed: true }), false);
});

test('FUNC-023: 참여자 목록 비교값은 id·닉네임·역·수정 시각이 바뀌면 달라진다', () => {
  const base = [person('a'), person('b', 'S2')];
  assert.equal(participantsSignature(base), participantsSignature([person('a'), person('b', 'S2')]));
  assert.notEqual(participantsSignature(base), participantsSignature([person('a')]));                       // 삭제
  assert.notEqual(participantsSignature(base), participantsSignature([...base, person('c')]));              // 추가
  assert.notEqual(participantsSignature(base), participantsSignature([person('a', 'S9'), person('b', 'S2')])); // 역 변경
  assert.notEqual(participantsSignature(base), participantsSignature([person('a', 'S1', 'T2'), person('b', 'S2')])); // 다시 저장
  assert.notEqual(participantsSignature(base), participantsSignature([person('a', 'S1', 'T1', '택이'), person('b', 'S2')])); // 닉네임
});

test('FUNC-023: 변화가 없으면 마지막 변화 시각을 유지하고, 10분이 지나면 idle', () => {
  const list = [person('a'), person('b')];
  const start = trackChange(null, list, 1000);
  assert.deepEqual(start, { signature: participantsSignature(list), changedAt: 1000, idle: false });

  const soon = trackChange(start, list, 1000 + 5000);
  assert.equal(soon.changedAt, 1000);
  assert.equal(soon.idle, false);

  const justBefore = trackChange(start, list, 1000 + POLL_STOP_AFTER_MS - 1);
  assert.equal(justBefore.idle, false);
  const atLimit = trackChange(start, list, 1000 + POLL_STOP_AFTER_MS);
  assert.equal(atLimit.idle, true);
  assert.equal(atLimit.changedAt, 1000);
});

test('FUNC-023: 목록이 바뀌면 10분 세기를 다시 시작한다', () => {
  const start = trackChange(null, [person('a')], 0);
  const changed = trackChange(start, [person('a'), person('b')], POLL_STOP_AFTER_MS - 1000);
  assert.equal(changed.changedAt, POLL_STOP_AFTER_MS - 1000);
  assert.equal(changed.idle, false);
  // 바뀐 시점부터 다시 10분이 지나야 멈춘다
  assert.equal(trackChange(changed, [person('a'), person('b')], POLL_STOP_AFTER_MS - 1000 + POLL_STOP_AFTER_MS - 1).idle, false);
  assert.equal(trackChange(changed, [person('a'), person('b')], POLL_STOP_AFTER_MS - 1000 + POLL_STOP_AFTER_MS).idle, true);
});

test('FUNC-023: 설정 간격은 5초, 중단은 10분 (config.js)', async () => {
  const config = await import('../src/js/config.js');
  assert.equal(config.POLL_INTERVAL_MS, 5000);
  assert.equal(config.POLL_STOP_AFTER_MS, 10 * 60 * 1000);
});

test('FUNC-023: 총무가 대신 입력하는 줄은 서버가 받는 형식의 participant_id를 가진다', () => {
  const { participant_id, nickname, origin_station_id } = newParticipant();
  assert.match(participant_id, /^[A-Za-z0-9_-]{8,64}$/); // api/room-participant.js가 받는 형식
  assert.equal(nickname, '');
  assert.equal(origin_station_id, null);
});
