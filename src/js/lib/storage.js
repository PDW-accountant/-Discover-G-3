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

let memoryParticipantId = null; // 저장소를 못 쓰는 브라우저에서 이 화면에 있는 동안 쓰는 id

/** 이 브라우저의 참여자 id (없으면 무작위로 만들어 저장). FUNC-022 */
export function getParticipantId() {
  const saved = read('eodiga3:pid');
  if (typeof saved === 'string' && saved) return saved;
  const id = memoryParticipantId ?? `p_${crypto.randomUUID().replace(/-/g, '')}`;
  memoryParticipantId = id;
  write('eodiga3:pid', id);
  return id;
}

/** 총무 토큰 저장·읽기. FUNC-021 */
export function setHostToken(roomId, token) { return write(`eodiga3:host:${roomId}`, token); }
export function getHostToken(roomId) { return read(`eodiga3:host:${roomId}`); }

// ---------- FUNC-019 입력 임시저장 (#17) ----------
// 방 없이 입력하는 동안(첫 화면 + 출발지 입력 로컬 모드)의 값을 저장한다. 방이 생기면 값은 서버에 있으므로 지운다.
// Draft: { version, saved_at, form?: {purpose, date, hour, min}, request?: {purpose, arrival_time},
//          participants?: [{participant_id, nickname, origin_station_id}] }
export const DRAFT_VERSION = 1;
export const DRAFT_SAVE_DELAY_MS = 500; // 입력 후 0.5초 지연 저장

/**
 * 임시저장. 지금 저장된 값에 덮어 합친다(첫 화면은 form만, 출발지 입력은 participants까지 저장).
 * @returns {boolean} 저장했으면 true (시크릿 모드·차단이면 false, 오류 없음)
 */
export function saveDraft(draft, now = new Date()) {
  return write('eodiga3:draft', { ...(loadDraft() ?? {}), ...draft, version: DRAFT_VERSION, saved_at: now.toISOString() });
}

/** 저장된 임시저장. 없으면 null. 형식·버전이 다르면 지우고 null. */
export function loadDraft() {
  const draft = read('eodiga3:draft');
  if (draft === null) return null;
  if (typeof draft !== 'object' || draft.version !== DRAFT_VERSION) {
    remove('eodiga3:draft');
    return null;
  }
  return draft;
}

export function clearDraft() {
  clearTimeout(draftTimer);
  remove('eodiga3:draft');
}

let draftTimer;
/** 입력할 때마다 부른다. 마지막 입력 0.5초 뒤에 한 번만 저장한다. */
export function saveDraftSoon(draft, delay = DRAFT_SAVE_DELAY_MS) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(draft), delay);
}

/** 이어서 입력할 만한 내용이 있는지: 목적을 골랐거나, 닉네임·출발역을 하나라도 넣었으면. */
export function hasDraftContent(draft) {
  if (!draft) return false;
  return Boolean(draft.form?.purpose) || (draft.participants ?? []).some((p) => String(p.nickname ?? '').trim() || p.origin_station_id);
}

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
