import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenForMeeting } from '../src/js/screens/my-meetings.js';
import { render as renderRoute } from '../src/js/screens/route.js';
import { render as renderParticipants } from '../src/js/screens/participants.js';
import { render as renderJoin } from '../src/js/screens/join.js';
import { encodeConfirmation } from '../src/js/lib/share-link.js';

// 실행: npm test
// #18 내 약속 목록 [열기]는 링크로 여는 대신 화면 이동 기록(go)을 거쳐 연다(#44). 어느 화면을 열지 고르는 부분을 검사한다.

const confirmation = {
  v: 1, p: '회식', a: '2026-10-05T10:00:00.000Z', s: 'S3', pl: 'P1', e: '2026-11-04T10:00:00.000Z',
  people: [{ n: '희원', s: 'S1', m: 20 }],
};
const hashUrl = `https://eodiga3.vercel.app/#d=${encodeConfirmation(confirmation)}`;
const roomUrl = 'https://eodiga3.vercel.app/?room=room_12345678';

test('#18·#44: 확정 약속(#d= 링크) → 개인 경로 화면, 링크를 푼 확정 정보와 그 주소', () => {
  const next = screenForMeeting({ url: hashUrl });
  assert.equal(next.renderFn, renderRoute);
  assert.equal(next.params.confirmation.s, 'S3');
  assert.deepEqual(next.params.confirmation.people, [{ n: '희원', s: 'S1', m: 20 }]);
  assert.equal(next.url, hashUrl);
});

test('#18·#44: 방 링크(?room=) → 총무 토큰이 있으면 총무 입력 현황, 없으면 참여자 입력', () => {
  const host = screenForMeeting({ url: roomUrl }, { hasHostToken: () => 'token' });
  assert.equal(host.renderFn, renderParticipants);
  assert.deepEqual(host.params, { room_id: 'room_12345678' });
  assert.equal(host.url, roomUrl);
  const guest = screenForMeeting({ url: roomUrl }, { hasHostToken: () => null });
  assert.equal(guest.renderFn, renderJoin);
  assert.deepEqual(guest.params, { room_id: 'room_12345678' });
});

test('#18·#44: 풀 수 없는 링크는 null (브라우저가 그대로 연다)', () => {
  assert.equal(screenForMeeting({ url: 'https://eodiga3.vercel.app/#d=not-valid' }), null);
  assert.equal(screenForMeeting({ url: 'https://eodiga3.vercel.app/' }), null);
});
