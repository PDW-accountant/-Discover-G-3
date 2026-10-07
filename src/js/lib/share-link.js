// 공유 링크 만들기·읽기 (개발 C) — FUNC-012, FUNC-014
// 저장소(Redis)가 있으면 방 링크 …/?room={id}를 쓰고,
// 없을 때만 확정 정보를 주소 # 뒤에 담는다 (…/#d=…). 키는 짧게, 역·장소는 id로.
// MeetingConfirmation: { v:1, p:목적, a:도착시각, s:역id, pl?:장소id, e:만료시각, people:[{n:닉네임, s:역id, m:분}], share_url }
//   pl 은 목적이 '기타'(장소 없이 역만 확정, #88)면 없다. 링크 버전은 그대로 1 — 예전 링크(pl 있음)도 그대로 열린다.
//   share_url은 화면에서 붙이는 값이라 링크 문자열에는 넣지 않는다.
// 링크에는 닉네임·출발역 id·분만 담는다. participant_id 등 다른 정보는 넣지 않는다 (FUNC-012 완료 조건).

import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH, PURPOSES } from '../config.js';

export const CONFIRMATION_VERSION = 1;
// ※ 공유 링크 만료 규칙은 미결(CLAUDE.md 10장). 정해지면 이 값만 바꾼다. 임시: 도착 희망 시각 + 30일.
export const LINK_EXPIRE_DAYS = 30;
// 링크를 열 때 만료 시각을 검사할지. 만료 규칙이 미결이라 지금은 끈다(#12 참고: 손상·형식 오류·없는 방만 안내).
// 기획팀이 정하면 true로 바꾸면 된다. 예시 링크는 10/30 이후까지 열려야 한다(CLAUDE.md 10장).
export const ENFORCE_LINK_EXPIRY = false;
// # 뒤 문자열 최대 길이. 넘으면 닉네임을 줄인다 (FUNC-012 예외).
export const MAX_ENCODED_LENGTH = 1800;

const DAY_MS = 24 * 60 * 60 * 1000;

const isText = (value, max = 64) => typeof value === 'string' && value.length > 0 && value.length <= max;
const isDate = (value) => isText(value) && !Number.isNaN(Date.parse(value));

/** travel_times에서 한 참여자의 분을 꺼낸다. { [participant_id]: {minutes} | 분 } 과 [{participant_id, minutes}] 둘 다 받는다. */
function minutesOf(travelTimes, participantId) {
  const entry = Array.isArray(travelTimes)
    ? travelTimes.find((t) => t?.participant_id === participantId)
    : travelTimes?.[participantId];
  const minutes = typeof entry === 'number' ? entry : entry?.minutes;
  return Number.isFinite(minutes) ? Math.round(minutes) : null;
}

/**
 * FUNC-012 확정 정보를 만든다 (share_url 제외).
 * @param {{purpose, arrival_time}} request MeetingRequest
 * @param {{station, travel_times}} selectedResult FairStationResult (1위)
 * @param {{place_id}} place Place
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 * @returns {MeetingConfirmation} 참여자 이동시간이 없거나 값이 맞지 않으면 예외
 */
export function createConfirmation(request, selectedResult, place, participants) {
  const arrival = new Date(request?.arrival_time);
  const people = (participants ?? []).map((p, i) => {
    const m = minutesOf(selectedResult?.travel_times, p.participant_id);
    if (m === null) throw new Error(`이동시간이 없는 참여자: ${p.participant_id}`);
    return { n: p.nickname?.trim() || `${i + 1}번`, s: p.origin_station_id, m };
  });
  const confirmation = normalizeConfirmation({
    v: CONFIRMATION_VERSION,
    p: request?.purpose,
    a: request?.arrival_time,
    s: selectedResult?.station?.id,
    ...(place?.place_id ? { pl: place.place_id } : {}), // 장소 없이 역만 확정하면(기타) pl 없음
    e: new Date(arrival.getTime() + LINK_EXPIRE_DAYS * DAY_MS).toISOString(),
    people,
  });
  if (!confirmation) throw new Error('확정 정보 형식이 올바르지 않습니다');
  return confirmation;
}

/**
 * 확정 정보 형식 검사. 맞으면 정해진 키만 남긴 새 객체, 아니면 null.
 * 링크 읽기(FUNC-014)와 서버 저장(api/room-confirm.js)이 같은 검사를 쓴다.
 */
export function normalizeConfirmation(value) {
  if (!value || typeof value !== 'object') return null;
  const { v, p, a, s, pl, e, people } = value;
  if (v !== CONFIRMATION_VERSION || !PURPOSES.includes(p) || !isDate(a) || !isText(s) || !isDate(e)) return null;
  if (pl != null && !isText(pl)) return null; // 장소는 선택 항목(기타는 없음). 있으면 문자열이어야 한다
  if (!Array.isArray(people) || people.length === 0 || people.length > MAX_PARTICIPANTS) return null;
  const names = new Set();
  const cleanPeople = [];
  for (const person of people) {
    const { n, s: from, m } = person ?? {};
    if (!isText(n) || Array.from(n).length > NICKNAME_MAX_LENGTH || /[\u0000-\u001f]/.test(n) || names.has(n)) return null;
    if (!isText(from) || !Number.isInteger(m) || m < 0 || m > 24 * 60) return null;
    names.add(n);
    cleanPeople.push({ n, s: from, m });
  }
  return { v, p, a, s, ...(pl != null ? { pl } : {}), e, people: cleanPeople };
}

/** 만료 시각이 지났는지. FUNC-014 */
export function isExpired(confirmation, now = new Date()) {
  return Date.parse(confirmation.e) <= now.getTime();
}

function toBase64Url(text) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/** 닉네임을 len자로 줄인다. 줄인 결과가 겹치면 null. */
function shortenNicknames(people, len) {
  const names = people.map((p) => Array.from(p.n).slice(0, len).join(''));
  return new Set(names).size === names.length ? people.map((p, i) => ({ ...p, n: names[i] })) : null;
}

/**
 * 확정 정보를 # 뒤에 넣을 문자열로 만든다 (JSON → UTF-8 → base64url).
 * 길이가 maxLength를 넘으면 닉네임을 앞에서부터 줄이고, 그래도 길면 번호(1, 2, …)로 바꾼다.
 */
export function encodeConfirmation(confirmation, { maxLength = MAX_ENCODED_LENGTH } = {}) {
  const base = normalizeConfirmation(confirmation);
  if (!base) throw new Error('확정 정보 형식이 올바르지 않습니다');
  const encode = (people) => toBase64Url(JSON.stringify({ ...base, people }));
  let text = encode(base.people);
  for (let len = NICKNAME_MAX_LENGTH - 1; text.length > maxLength && len >= 1; len -= 1) {
    const shorter = shortenNicknames(base.people, len);
    if (shorter) text = encode(shorter);
  }
  if (text.length > maxLength) text = encode(base.people.map((p, i) => ({ ...p, n: String(i + 1) })));
  return text;
}

/** # 뒤 문자열을 확정 정보로 되돌린다. '#d='·'d=' 접두어는 있어도 된다. 형식이 맞지 않으면 null (→ 안내 화면). */
export function decodeConfirmation(text) {
  if (typeof text !== 'string') return null;
  const body = text.replace(/^#/, '').replace(/^d=/, '');
  if (!body || body.length > MAX_ENCODED_LENGTH * 2 || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  try {
    return normalizeConfirmation(JSON.parse(fromBase64Url(body)));
  } catch {
    return null;
  }
}

const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * FUNC-014 주소를 읽어 어느 화면을 열지 정한다. 화면(main.js)은 이 결과대로 render만 부른다.
 * @param {string|URL|Location} url 지금 주소 (보통 location)
 * @returns {{type:'room', room_id:string}
 *   | {type:'confirmation', confirmation: MeetingConfirmation}  share_url은 지금 주소
 *   | {type:'invalid', reason:'damaged'|'expired'}             → 안내 화면(link-error)
 *   | {type:'home'}}                                           → 첫 화면
 */
export function readShareUrl(url, { now = new Date(), enforceExpiry = ENFORCE_LINK_EXPIRY } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url?.href ?? url));
  } catch {
    return { type: 'home' };
  }
  // 방 링크 …/?room={id}: 방 상태(입력 중/확정/없음)는 참여자 화면(join.js)이 서버에서 읽어 정한다.
  const roomId = parsed.searchParams.get('room');
  if (roomId !== null) return ROOM_ID_PATTERN.test(roomId) ? { type: 'room', room_id: roomId } : { type: 'invalid', reason: 'damaged' };
  // 저장소 없이 만든 링크 …/#d=…
  if (!parsed.hash.startsWith('#d=')) return { type: 'home' };
  const confirmation = decodeConfirmation(parsed.hash);
  if (!confirmation) return { type: 'invalid', reason: 'damaged' };
  if (enforceExpiry && isExpired(confirmation, now)) return { type: 'invalid', reason: 'expired' };
  return { type: 'confirmation', confirmation: { ...confirmation, share_url: parsed.href } };
}

/** 저장소 없이 쓰는 공유 링크 주소 (…/#d=…). */
export function hashUrl(confirmation, origin = location.origin) {
  return `${origin}/#d=${encodeConfirmation(confirmation)}`;
}

/** 방 링크 주소. */
export function roomUrl(roomId, origin = location.origin) {
  return `${origin}/?room=${encodeURIComponent(roomId)}`;
}

/**
 * 받은 약속을 '내 약속'에 남길 때 쓰는 대표 주소(#97). 방이면 방 링크, 아니면 확정 정보로 다시 만든 #d= 링크.
 * 캘린더용 ?cal= 처럼 덧붙은 값이 있어도 같은 약속은 같은 주소가 되어, 총무가 만든 항목·이미 받은 항목과 한 줄로 묶인다.
 */
export function receivedMeetingUrl(confirmation, { roomId = null, origin = location.origin } = {}) {
  if (roomId) return roomUrl(roomId, origin);
  const { share_url: _shareUrl, ...rest } = confirmation;
  return hashUrl(rest, origin);
}
