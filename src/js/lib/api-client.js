// 서버 함수(api/) 호출 모음 (개발 B) — FUNC-021, 022, 023, 012
// 이동시간은 서버가 아니라 lib/transit.js가 브라우저에서 계산한다.
// 화면 코드는 fetch를 직접 쓰지 않고 이 파일의 함수만 쓴다.
// 서버가 없거나(Live Server로 화면만 볼 때) 실패하면 예외 대신 대체 값을 돌려줘 화면이 멈추지 않게 한다(NFR-011).

/** 서버 기능 사용 가능 여부. 서버가 없으면 false. @returns {Promise<{rooms:boolean}>} */
export async function getStatus() {
  throw new Error('아직 구현되지 않았습니다');
}

/** FUNC-021 모임 방 만들기. @returns {Promise<{room_id, join_url, host_token}>} */
export async function createRoom(request) {
  throw new Error('아직 구현되지 않았습니다');
}

/** FUNC-014·023 방 정보 읽기. @returns {Promise<Room|null>} 없거나 만료면 null */
export async function getRoom(roomId) {
  throw new Error('아직 구현되지 않았습니다');
}

/** FUNC-022·023 참여자 저장(추가·수정). 총무가 대신 입력할 때는 hostToken을 함께 보낸다. */
export async function saveParticipant(roomId, participant, hostToken) {
  throw new Error('아직 구현되지 않았습니다');
}

/** FUNC-023 참여자 삭제 (총무만). */
export async function deleteParticipant(roomId, participantId, hostToken) {
  throw new Error('아직 구현되지 않았습니다');
}

/** FUNC-012 모임 확정 정보를 방에 저장 (총무만). */
export async function confirmRoom(roomId, confirmation, hostToken) {
  throw new Error('아직 구현되지 않았습니다');
}
