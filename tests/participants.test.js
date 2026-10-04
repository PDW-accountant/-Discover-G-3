import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canFind, checkParticipants, displayName, newParticipant, participantsSignature, progressOf, splitRowsForRoom, toParticipants, trackChange,
} from '../src/js/screens/participants.js';
import { POLL_STOP_AFTER_MS } from '../src/js/config.js';

// 실행: npm test

const nameFor = (n) => `${n}번`;
const row = (nickname, origin_station_id = 'S1', participant_id = `p_${nickname}`) => ({ participant_id, nickname, origin_station_id });
const check = (rows) => checkParticipants(rows, nameFor);

test('FUNC-003: 새 참여자 줄은 { participant_id, nickname, origin_station_id } 형태, id는 무작위 문자열', () => {
  const a = newParticipant();
  assert.deepEqual(Object.keys(a).sort(), ['nickname', 'origin_station_id', 'participant_id']);
  assert.match(a.participant_id, /^p_[0-9a-f]{32}$/);
  assert.notEqual(a.participant_id, newParticipant().participant_id);
});

test("FUNC-003: 닉네임이 비면 'N번'으로 보인다 (앞뒤 공백 제거)", () => {
  assert.equal(displayName(row(''), 0, nameFor), '1번');
  assert.equal(displayName(row('   '), 2, nameFor), '3번');
  assert.equal(displayName(row(' 희원 '), 1, nameFor), '희원');
});

test("FUNC-003: 3명 이상이고 모두 출발역이 있으면 '찾기'를 켤 수 있다", () => {
  assert.deepEqual(check([row('가'), row('나'), row('')]), {
    ready: true, problem: null, tooLong: [], duplicate: [], missing: [],
  });
});

test("FUNC-003: 3명 미만·9명 초과면 '찾기'가 꺼진다", () => {
  assert.equal(check([row('가'), row('나')]).problem, 'count');
  const ten = Array.from({ length: 10 }, (_, i) => row(`p${i}`));
  assert.equal(check(ten).problem, 'count');
  assert.equal(check(ten.slice(0, 9)).ready, true);
});

test("FUNC-003: 출발역을 안 고른 줄이 있으면 '찾기'가 꺼지고 그 줄 번호를 알려준다", () => {
  const result = check([row('가'), row('나', null), row('다', null)]);
  assert.equal(result.ready, false);
  assert.equal(result.problem, 'station');
  assert.deepEqual(result.missing, [1, 2]);
});

test('FUNC-003: 같은 닉네임은 허용하지 않는다 (자동 이름 N번과 겹쳐도 중복)', () => {
  const same = check([row('희원'), row(' 희원'), row('대원')]);
  assert.equal(same.problem, 'duplicate');
  assert.deepEqual(same.duplicate, [0, 1]);
  const auto = check([row('2번'), row(''), row('대원')]); // 둘째 줄의 자동 이름도 '2번'
  assert.equal(auto.problem, 'duplicate');
  assert.deepEqual(auto.duplicate, [0, 1]);
});

test('FUNC-003: 닉네임은 6자 이내', () => {
  assert.equal(check([row('여섯글자이름'), row('나'), row('다')]).ready, true);
  const long = check([row('일곱글자의이름'), row('나'), row('다')]);
  assert.equal(long.problem, 'tooLong');
  assert.deepEqual(long.tooLong, [0]);
});

test("FUNC-003: 다음 단계로 넘기는 Participant[]는 빈 닉네임을 'N번'으로 채운다", () => {
  const rows = [row(' 희원 ', 'S1', 'p_a'), row('', 'S2', 'p_b'), row('대원', 'S3', 'p_c')];
  assert.deepEqual(toParticipants(rows, nameFor), [
    { participant_id: 'p_a', nickname: '희원', origin_station_id: 'S1' },
    { participant_id: 'p_b', nickname: '2번', origin_station_id: 'S2' },
    { participant_id: 'p_c', nickname: '대원', origin_station_id: 'S3' },
  ]);
  assert.equal(rows[0].nickname, ' 희원 '); // 원래 줄은 바꾸지 않는다
});

test("FUNC-021: 링크로 바꿀 때 역까지 고른 줄은 방에 저장하고, 닉네임만 쓴 줄은 남기고, 빈 줄은 버린다", () => {
  const rows = [row('가', 'S1'), row('나', null), row('', null), row('', 'S2'), row('  ', null)];
  const { save, keep } = splitRowsForRoom(rows);
  assert.deepEqual(save.map((r) => r.participant_id), ['p_가', 'p_']);
  assert.deepEqual(keep.map((r) => r.nickname), ['나']);
});

// ---------- FUNC-023 (#21): 방 모드 입력 현황 ----------

const stationRow = (station) => ({ participant_id: 'p_x', nickname: '', origin_station_id: station });
const person = (id, station = 'S1', updatedAt = 'T1', nickname = '감이') => ({ participant_id: id, nickname, origin_station_id: station, updated_at: updatedAt });

test('FUNC-023: 입력 현황은 "n명 중 m명"이고 n은 최소 인원(3)보다 작지 않다', () => {
  assert.deepEqual(progressOf([]), { done: 0, total: 3 });
  assert.deepEqual(progressOf([stationRow('S1')]), { done: 1, total: 3 });
  assert.deepEqual(progressOf([stationRow('S1'), stationRow('S2'), stationRow(null)]), { done: 2, total: 3 });
  assert.deepEqual(progressOf([stationRow('S1'), stationRow('S2'), stationRow('S3'), stationRow('S4')]), { done: 4, total: 4 });
  assert.deepEqual(progressOf([stationRow('S1'), stationRow(null), stationRow(''), stationRow('S2'), stationRow('S3')]), { done: 3, total: 5 }); // 빈 값은 입력 전
});

test('FUNC-023: 3명 이상이고 모두 출발역이 있어야 찾기가 켜진다', () => {
  assert.equal(canFind([stationRow('S1'), stationRow('S2'), stationRow('S3')]), true);
  assert.equal(canFind([stationRow('S1'), stationRow('S2')]), false);                    // 3명 미만
  assert.equal(canFind([stationRow('S1'), stationRow('S2'), stationRow(null)]), false);          // 출발역 없는 줄
  assert.equal(canFind([]), false);
  const nine = Array.from({ length: 9 }, () => stationRow('S1'));
  assert.equal(canFind(nine), true);
  assert.equal(canFind([...nine, stationRow('S1')]), false);                      // 9명 초과
});

test('FUNC-023: 총무가 아니거나 이미 확정된 방은 찾기를 켤 수 없다 (보기만)', () => {
  const ok = [stationRow('S1'), stationRow('S2'), stationRow('S3')];
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
