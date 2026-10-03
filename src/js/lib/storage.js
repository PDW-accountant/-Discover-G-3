// 브라우저 저장소 localStorage (개발 A) — FUNC-019, FUNC-020, FUNC-021, FUNC-022
// 모든 접근은 try/catch로 감싼다. 시크릿 모드·차단 시에도 저장 없이 정상 동작해야 한다.
// 키: eodiga3:draft, eodiga3:meetings, eodiga3:pid, eodiga3:host:{room}

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { /* 저장소 사용 불가 */ }
}

/** 이 브라우저의 참여자 id (없으면 무작위로 만들어 저장). FUNC-022 */
export function getParticipantId() {
  throw new Error('아직 구현되지 않았습니다');
}

/** 총무 토큰 저장·읽기. FUNC-021 */
export function setHostToken(roomId, token) { return write(`eodiga3:host:${roomId}`, token); }
export function getHostToken(roomId) { return read(`eodiga3:host:${roomId}`); }

/** FUNC-019 (여유 되면) 입력 임시저장. { version:1, saved_at, request, participants } */
export function saveDraft(draft) {
  throw new Error('아직 구현되지 않았습니다');
}
export function loadDraft() {
  throw new Error('아직 구현되지 않았습니다');
}
export function clearDraft() { remove('eodiga3:draft'); }

/** FUNC-020 (여유 되면) 내 모임 목록. 최근 순, 최대 20건. */
export function addMeeting(meeting) {
  throw new Error('아직 구현되지 않았습니다');
}
export function listMeetings() {
  throw new Error('아직 구현되지 않았습니다');
}
export function removeMeeting(shareUrl) {
  throw new Error('아직 구현되지 않았습니다');
}
