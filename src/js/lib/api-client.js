// 서버 함수(api/) 호출 모음 (개발 B) — FUNC-021, 022, 023, 012
// 이동시간은 서버가 아니라 lib/transit.js가 브라우저에서 계산한다.
// 화면 코드는 fetch를 직접 쓰지 않고 이 파일의 함수만 쓴다.
// 서버가 없거나(Live Server로 화면만 볼 때) 실패하면 예외 대신 대체 값을 돌려줘 화면이 멈추지 않게 한다(NFR-011).

/** 서버 기능 사용 가능 여부. 서버가 없거나 응답이 이상하면 false. @returns {Promise<{rooms:boolean}>} */
export async function getStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json().catch(() => null);
    return { rooms: res.ok && data?.rooms === true };
  } catch {
    return { rooms: false };
  }
}

/**
 * FUNC-021 모임 방 만들기.
 * @param {{purpose, arrival_time}} request MeetingRequest
 * @returns {Promise<{room_id, join_url, host_token}|{error:string}>}
 *   성공하면 Room. 실패하면 { error }: 'invalid' | 'unavailable' (→ 총무 일괄 입력으로 진행 안내)
 */
export async function createRoom(request) {
  try {
    const res = await fetch('/api/room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: request.purpose, arrival_time: request.arrival_time }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.room_id && data?.join_url && data?.host_token) {
      return { room_id: data.room_id, join_url: data.join_url, host_token: data.host_token };
    }
    return { error: data?.error === 'invalid' ? 'invalid' : 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}

/**
 * FUNC-014·023 방 정보 읽기. 총무 화면은 hostToken을 함께 보내 총무인지(is_host)를 확인한다(주소가 아닌 헤더로 보낸다).
 * @param {string} roomId
 * @param {string} [hostToken]
 * @returns {Promise<{room_id, purpose, arrival_time, status, is_host, participants: RoomParticipant[], confirmation?}|null>}
 *   방이 없거나 만료되었으면 null. 서버가 없거나 응답이 이상하면 예외 — 부르는 화면이 '불러오지 못했어요'로 안내한다.
 */
export async function getRoom(roomId, hostToken) {
  const res = await fetch(`/api/room?id=${encodeURIComponent(roomId)}`, {
    headers: hostToken ? { 'x-host-token': hostToken } : {},
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (res.status === 404 && data?.error === 'not_found') return null;
  if (!res.ok || !data || !Array.isArray(data.participants)) throw new Error('방 정보를 불러오지 못했습니다');
  return data;
}

/**
 * FUNC-022·023 참여자 저장(추가·수정). 총무가 대신 입력할 때는 hostToken을 함께 보낸다.
 * @param {string} roomId
 * @param {{participant_id, nickname, origin_station_id}} participant
 * @returns {Promise<{participant_id, nickname, origin_station_id, updated_at}|{error:string}>}
 *   성공하면 RoomParticipant. 실패하면 { error }: 'not_found' | 'confirmed' | 'full' | 'duplicate_nickname' | 'invalid' | 'unavailable'
 */
export async function saveParticipant(roomId, participant, hostToken) {
  const body = {
    room_id: roomId,
    participant_id: participant.participant_id,
    nickname: participant.nickname,
    origin_station_id: participant.origin_station_id,
  };
  if (hostToken) body.host_token = hostToken;
  try {
    const res = await fetch('/api/room-participant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.participant) return data.participant;
    return { error: data?.error ?? 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}

/**
 * FUNC-023 참여자 삭제 (총무만).
 * @returns {Promise<{ok:true}|{error:string}>} 실패하면 { error }: 'not_found' | 'forbidden' | 'confirmed' | 'invalid' | 'unavailable'
 */
export async function deleteParticipant(roomId, participantId, hostToken) {
  try {
    const res = await fetch('/api/room-participant', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, participant_id: participantId, host_token: hostToken }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok === true) return { ok: true };
    return { error: data?.error ?? 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}

/**
 * FUNC-020(#18) 입력 받는 중인 방 지우기 (총무만, 내 약속 목록에서 삭제할 때). 토큰은 헤더로 보낸다.
 * @returns {Promise<{ok:true}|{error:string}>} 실패하면 { error }: 'not_found' | 'forbidden' | 'confirmed' | 'invalid' | 'unavailable'
 */
export async function deleteRoom(roomId, hostToken) {
  try {
    const res = await fetch(`/api/room?id=${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
      headers: hostToken ? { 'x-host-token': hostToken } : {},
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.ok === true) return { ok: true };
    return { error: data?.error ?? 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}

/**
 * FUNC-012 모임 확정 정보를 방에 저장 (총무만).
 * @param {string} roomId
 * @param {MeetingConfirmation} confirmation share_url은 보내지 않는다(서버가 형식 검사 후 버림)
 * @param {string} hostToken
 * @returns {Promise<{confirmation}|{error:string}>}
 *   실패하면 { error }: 'not_found' | 'forbidden' | 'invalid' | 'unavailable'
 */
export async function confirmRoom(roomId, confirmation, hostToken) {
  try {
    const res = await fetch('/api/room-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, host_token: hostToken, confirmation }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.confirmation) return { confirmation: data.confirmation };
    return { error: data?.error ?? 'unavailable' };
  } catch {
    return { error: 'unavailable' };
  }
}
