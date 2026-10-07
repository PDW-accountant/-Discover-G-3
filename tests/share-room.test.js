import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveConfirmationToNewRoom } from '../src/js/lib/share-room.js';
import { createConfirmation, encodeConfirmation, hashUrl, roomUrl } from '../src/js/lib/share-link.js';
import { NICKNAME_MAX_LENGTH } from '../src/js/config.js';

// 실행: npm test   (#101 방 없이 확정해도 새 방에 저장해 짧은 방 링크로 공유)

const request = { purpose: '회식', arrival_time: '2026-10-08T10:00:00.000Z' };
const SITE = 'https://eodiga3.vercel.app';

/** 9명·6글자 닉네임 확정 정보 (가장 긴 경우) */
function bigConfirmation(count = 9) {
  const participants = Array.from({ length: count }, (_, i) => ({ participant_id: `p_${i}xxxxxxxx`, nickname: `여섯글자닉${i}`.slice(0, NICKNAME_MAX_LENGTH), origin_station_id: `S0${100 + i}` }));
  const travel_times = Object.fromEntries(participants.map((p, i) => [p.participant_id, { minutes: 20 + i }]));
  const selected = { station: { id: 'S0153' }, travel_times };
  return createConfirmation(request, selected, { place_id: 'P-S0153-회식-1' }, participants);
}

/** 서버·저장소 흉내. calls 에 부른 순서를 남긴다. */
function fakes({ create = { room_id: 'roomABCDEFGH', host_token: 'host-token-123456', join_url: `${SITE}/?room=roomABCDEFGH` }, confirm = { confirmation: {} }, throwOn = null } = {}) {
  const calls = [];
  const maybeThrow = (name) => { if (throwOn === name) throw new Error(`${name} 실패`); };
  return {
    calls,
    deps: {
      createRoom: async (req) => { calls.push(['createRoom', req]); maybeThrow('createRoom'); return create; },
      confirmRoom: async (id, c, token) => { calls.push(['confirmRoom', id, token, c]); maybeThrow('confirmRoom'); return confirm; },
      deleteRoom: async (id, token) => { calls.push(['deleteRoom', id, token]); maybeThrow('deleteRoom'); return { ok: true }; },
      setHostToken: (id, token) => { calls.push(['setHostToken', id, token]); maybeThrow('setHostToken'); return true; },
    },
  };
}

test('#101: 방을 만들고 같은 토큰으로 확정 정보를 저장한 뒤, 이 기기를 총무로 기억하고 방 id를 돌려준다', async () => {
  const c = bigConfirmation();
  const { calls, deps } = fakes();
  assert.equal(await saveConfirmationToNewRoom(request, c, deps), 'roomABCDEFGH');
  assert.deepEqual(calls.map((x) => x[0]), ['createRoom', 'confirmRoom', 'setHostToken']);
  assert.deepEqual(calls[0][1], request);                          // 목적·도착 시각으로 방을 만든다
  assert.deepEqual(calls[1].slice(1, 3), ['roomABCDEFGH', 'host-token-123456']);
  assert.equal(calls[1][3], c);                                    // 만든 확정 정보를 그대로 저장
  assert.deepEqual(calls[2].slice(1), ['roomABCDEFGH', 'host-token-123456']);
});

test('#101: 서버가 없거나(저장소 없이 실행) 방을 못 만들면 null — 확정 저장·토큰 저장을 하지 않는다', async () => {
  for (const create of [{ error: 'unavailable' }, { error: 'invalid' }, null, { room_id: 'roomABCDEFGH' }, { host_token: 'x'.repeat(10) }]) {
    const { calls, deps } = fakes({ create });
    assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), deps), null, JSON.stringify(create));
    assert.deepEqual(calls.map((x) => x[0]), ['createRoom']);
  }
  const { calls, deps } = fakes({ throwOn: 'createRoom' });
  assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), deps), null);
  assert.deepEqual(calls.map((x) => x[0]), ['createRoom']);
});

test('#101: 방은 만들었는데 확정 저장에 실패하면 그 빈 방을 지우고 null (총무로 기억하지 않는다)', async () => {
  for (const confirm of [{ error: 'unavailable' }, { error: 'forbidden' }, { error: 'invalid' }, null]) {
    const { calls, deps } = fakes({ confirm });
    assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), deps), null, JSON.stringify(confirm));
    assert.deepEqual(calls.map((x) => x[0]), ['createRoom', 'confirmRoom', 'deleteRoom']);
    assert.deepEqual(calls[2].slice(1), ['roomABCDEFGH', 'host-token-123456']);
  }
  const thrown = fakes({ throwOn: 'confirmRoom' });
  assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), thrown.deps), null);
  assert.deepEqual(thrown.calls.map((x) => x[0]), ['createRoom', 'confirmRoom', 'deleteRoom']);
});

test('#101: 빈 방 지우기까지 실패해도 오류 없이 null (방은 30일 뒤 만료)', async () => {
  const { deps } = fakes({ confirm: { error: 'unavailable' }, throwOn: 'deleteRoom' });
  assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), deps), null);
});

test('#101: 토큰 저장이 막힌 브라우저(시크릿 모드 차단 등)여도 방 링크는 쓴다', async () => {
  const { deps } = fakes({ throwOn: 'setHostToken' });
  assert.equal(await saveConfirmationToNewRoom(request, bigConfirmation(), deps), 'roomABCDEFGH');
});

test('#101: 방 링크는 인원과 상관없이 짧고, #d= 링크는 인원이 많을수록 길어진다 (카카오 공유 한도의 원인)', () => {
  const room = roomUrl('roomABCDEFGH', SITE);
  assert.ok(room.length < 60, room);
  const three = hashUrl(bigConfirmation(3), SITE).length;
  const nine = hashUrl(bigConfirmation(9), SITE).length;
  assert.ok(nine > three + 200, `3명 ${three}자, 9명 ${nine}자`);
  assert.ok(nine > 500, `9명 #d= 링크 ${nine}자`); // 카카오톡 공유에서 7명(약 500자)부터 '메시지 크기 한도 초과'였다
  assert.ok(encodeConfirmation(bigConfirmation(9)).length > room.length * 8);
});
