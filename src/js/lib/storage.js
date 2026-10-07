// 브라우저 저장소 localStorage (개발 A) — FUNC-019, FUNC-020, FUNC-021, FUNC-022
// 모든 접근은 try/catch로 감싼다. 시크릿 모드·차단 시에도 저장 없이 정상 동작해야 한다.
// 키: eodiga3:draft, eodiga3:meetings, eodiga3:pid, eodiga3:host:{room}

import { MAX_SAVED_MEETINGS } from '../config.js';

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

// ---------- FUNC-020 내 모임 목록 (#18) ----------
// 이 브라우저의 약속을 최근 순으로 최대 20건. 방을 만들 때 '입력중'으로 넣고, 확정하면 같은 방 항목을 '확정'으로 바꾼다.
// 링크로 받은 확정 약속도 개인 경로 화면을 열 때 '받은 약속'(received: true)으로 넣는다(#97).
// MyMeeting: { key, status: '입력중'|'확정', received?, room_id?, purpose, arrival_time, station_id?, place_id?, url, saved_at }
//   key: 방이 있으면 'room:{id}'(같은 방은 한 줄), 없으면 공유 링크(#d=…)
const roomIdOfUrl = (url) => {
  try { return new URL(url, 'https://x.invalid').searchParams.get('room'); } catch { return null; }
};

function upsertMeeting(entry, now) {
  const list = listMeetings().filter((m) => m.key !== entry.key);
  list.unshift({ ...entry, saved_at: now.toISOString() });
  return write('eodiga3:meetings', list.slice(0, MAX_SAVED_MEETINGS)); // 20건을 넘으면 오래된 것부터 지운다
}

/** 방을 만들었을 때: '입력 받는 중' 항목. @param {{room_id, purpose, arrival_time, url}} room */
export function addRoomMeeting(room, now = new Date()) {
  return upsertMeeting({
    key: `room:${room.room_id}`, status: '입력중', room_id: room.room_id,
    purpose: room.purpose, arrival_time: room.arrival_time, url: room.url,
  }, now);
}

/** 확정했을 때(confirm.js): 같은 방 항목이 있으면 '확정'으로 바꾸고, 방 없이 확정했으면 새 항목. @param {MeetingConfirmation} confirmation share_url 포함 */
export function addMeeting(confirmation, now = new Date()) {
  const roomId = roomIdOfUrl(confirmation.share_url);
  return upsertMeeting({
    key: roomId ? `room:${roomId}` : confirmation.share_url, status: '확정', ...(roomId ? { room_id: roomId } : {}),
    purpose: confirmation.p, arrival_time: confirmation.a, station_id: confirmation.s, place_id: confirmation.pl,
    url: confirmation.share_url,
  }, now);
}

/**
 * 링크로 받은 확정 약속(#97): 개인 경로 화면이 열릴 때 이 브라우저의 목록에 '받은 약속'으로 넣는다.
 * 같은 약속이 이미 있으면 — 내가 만든 약속(총무)이면 그대로 두고, 전에 받은 약속이면 최신 확정 내용으로 맨 위에 다시 넣는다.
 * @param {MeetingConfirmation} confirmation @param {string} url share-link.js receivedMeetingUrl()로 만든 대표 주소
 * @returns {boolean} 저장했으면 true
 */
export function addReceivedMeeting(confirmation, url, now = new Date()) {
  const roomId = roomIdOfUrl(url);
  const key = roomId ? `room:${roomId}` : url;
  const existing = listMeetings().find((m) => m.key === key);
  if (existing && !existing.received) return false;
  return upsertMeeting({
    key, status: '확정', received: true, ...(roomId ? { room_id: roomId } : {}),
    purpose: confirmation.p, arrival_time: confirmation.a, station_id: confirmation.s, place_id: confirmation.pl, url,
  }, now);
}

/** 저장된 목록(최근 순). 저장소를 못 쓰거나 형식이 이상하면 빈 목록. */
export function listMeetings() {
  const list = read('eodiga3:meetings');
  return Array.isArray(list) ? list.filter((m) => m && typeof m.key === 'string' && typeof m.url === 'string') : [];
}

/** 목록에서 한 항목을 지운다. 방 항목이면 이 기기의 총무 토큰도 지운다(서버의 방은 화면이 deleteRoom으로 지운다). */
export function removeMeeting(key) {
  const target = listMeetings().find((m) => m.key === key);
  if (target?.room_id) remove(`eodiga3:host:${target.room_id}`);
  return write('eodiga3:meetings', listMeetings().filter((m) => m.key !== key));
}
