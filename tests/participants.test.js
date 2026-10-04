import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkParticipants, displayName, newParticipant, toParticipants } from '../src/js/screens/participants.js';

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
