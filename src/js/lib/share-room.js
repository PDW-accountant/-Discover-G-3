// 방 없이 확정할 때 공유용 방 만들기 (#101)
// 총무가 출발지를 직접 다 입력해 방 없이 확정해도, 확정 정보를 새 방에 저장해 짧은 방 링크(?room=)로 공유한다.
// 참여자 전원을 주소에 담는 #d= 링크는 7명부터 길어져 카카오톡 공유가 '메시지 크기 한도 초과'(요청 실패)로 거절됐다.
// 서버를 못 쓰면(저장소 없이 실행·장애) null → 부르는 쪽(confirm.js)이 지금처럼 #d= 링크로 확정한다(NFR-011).
// 화면 코드 없이 시험할 수 있게 서버 호출·저장 함수는 인자로 받는다.

/**
 * 새 방을 만들고 확정 정보를 저장한다.
 * @param {{purpose, arrival_time}} request MeetingRequest
 * @param {MeetingConfirmation} confirmation share_url 없는 확정 정보
 * @param {{createRoom, confirmRoom, deleteRoom, setHostToken}} deps api-client.js·storage.js 함수
 * @returns {Promise<string|null>} 저장한 방 id. 방을 못 만들었거나 확정 저장에 실패하면 null(만든 방은 지운다)
 */
export async function saveConfirmationToNewRoom(request, confirmation, { createRoom, confirmRoom, deleteRoom, setHostToken }) {
  let created;
  try {
    created = await createRoom(request);
  } catch {
    return null;
  }
  if (!created || created.error || !created.room_id || !created.host_token) return null;

  let saved;
  try {
    saved = await confirmRoom(created.room_id, confirmation, created.host_token);
  } catch {
    saved = null;
  }
  if (!saved || saved.error) {
    try { await deleteRoom(created.room_id, created.host_token); } catch { /* 못 지우면 30일 뒤 만료된다 */ }
    return null;
  }
  // 이 기기를 그 방의 총무로 기억한다(방 링크로 다시 열면 총무 화면 → 확정된 방이라 경로 화면). 저장이 막혀도 링크는 그대로 쓴다
  try { setHostToken(created.room_id, created.host_token); } catch { /* 저장소가 막힌 브라우저 */ }
  return created.room_id;
}
