// 총무 토큰(host_token) 해시 (개발 B) — FUNC-021, FUNC-012, FUNC-023
// 서버에는 토큰 원문을 두지 않고 해시만 room:{id}의 host_token_hash에 저장한다.
// 방 만들기(api/room.js)와 확인하는 쪽(room-confirm, room-participant DELETE)이 모두 이 함수를 써야 값이 맞는다.

import { createHash } from 'node:crypto';

/** SHA-256 16진수 문자열. */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}
