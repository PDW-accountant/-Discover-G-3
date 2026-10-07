// ② 출발역 입력 (총무 화면) (개발 A) — FUNC-002, FUNC-003, FUNC-021, FUNC-023
// 참여자 3~9명, 닉네임 6자 이내·중복 불가, 출발역 검색. 방이 있으면 5초마다 입력 현황(n명 중 m명) 갱신. 조건이 맞으면 '찾기' 활성화.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 출발지 입력 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, room_id?, join_url?, participants?: Participant[] } — 첫 화면(meeting-form)에서 넘어온다.
// 참여자 줄: { participant_id, nickname, origin_station_id } — recommend.js·share-link.js·서버 저장과 같은 이름.
// FUNC-002(#3): 줄마다 출발역 검색·선택. FUNC-003(#4): 닉네임(비우면 'N번', 중복 불가), 인원 3~9명 조절, '찾기' → 추천 결과(result).
// FUNC-021(#19): 저장소가 있으면 이 화면의 '링크로 입력받기'로 방을 만든다. 역까지 고른 줄은 방에 저장하고, 링크를 보여준 뒤 방 모드로 바뀐다.
//   방 모드가 되면 주소를 ?room={id}로 바꾼다. 총무 기기에서 그 주소를 다시 열면 main.js가 이 화면을 연다(확정된 방이면 경로 화면).
// FUNC-023(#21): 방 모드는 방의 참여자 목록을 5초마다 읽어 명단·'n명 중 m명'을 보여주고,
//   총무는 삭제와 대신 입력(역을 고르면 바로 방에 저장)을 하고, 총무가 아니면 보기만 한다. 10분 동안 변화가 없으면 자동 확인을 멈추고 새로고침 버튼을 보여준다.
//   '찾기'는 방의 참여자 목록으로 결과 화면(#7, result.js)을 연다. 방이 없으면 로컬 모드(총무가 모두 입력)로 동작한다.

import { loadData, t } from '../lib/data.js';
import { lineBadge, rareServiceNotices, searchStations } from '../lib/stations.js';
import { createShell, el, go, replace } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { createRoom, deleteParticipant, getRoom, getStatus, saveParticipant } from '../lib/api-client.js';
import { addRoomMeeting, clearDraft, getHostToken, saveDraftSoon, setHostToken } from '../lib/storage.js';
import { roomUrl } from '../lib/share-link.js';
import { copyLink } from '../lib/share.js';
import { MAX_PARTICIPANTS, MIN_PARTICIPANTS, NICKNAME_MAX_LENGTH, POLL_INTERVAL_MS, POLL_STOP_AFTER_MS } from '../config.js';
import { render as renderResult } from './result.js';
import { render as renderRoute } from './route.js';

const SEARCH_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// 서버가 돌려주는 거절 이유 → 안내 문구 키
const SAVE_ERRORS = { full: 'join.full', confirmed: 'participants.roomConfirmed', not_found: 'link.invalid', duplicate_nickname: 'join.nicknameTaken' };
const REMOVE_ERRORS = { forbidden: 'participants.forbidden', confirmed: 'participants.roomConfirmed', not_found: 'link.invalid' };

const defaultName = (n) => t('participants.defaultName', { n });

/** 참여자 줄 하나. participant_id는 무작위 문자열(공유 링크·각자 입력과 같은 형식). */
export function newParticipant() {
  return { participant_id: `p_${crypto.randomUUID().replace(/-/g, '')}`, nickname: '', origin_station_id: null };
}

/** 화면에 보이는 이름: 닉네임(앞뒤 공백 제거), 비었으면 'N번'. */
export function displayName(row, index, nameFor = defaultName) {
  return String(row.nickname ?? '').trim() || nameFor(index + 1);
}

/**
 * 참여자 목록 점검. '찾기'를 켤 수 있는지와 줄별 문제를 돌려준다.
 * @param {Array<{participant_id, nickname, origin_station_id}>} rows
 * @returns {{ready:boolean, problem:null|'count'|'tooLong'|'duplicate'|'station', tooLong:number[], duplicate:number[], missing:number[]}}
 *   tooLong·duplicate·missing은 문제가 있는 줄 번호(0부터)
 */
export function checkParticipants(rows, nameFor = defaultName) {
  const names = rows.map((row, i) => displayName(row, i, nameFor));
  const tooLong = names.flatMap((name, i) => (Array.from(name).length > NICKNAME_MAX_LENGTH ? [i] : []));
  const duplicate = names.flatMap((name, i) => (names.indexOf(name) !== names.lastIndexOf(name) ? [i] : []));
  const missing = rows.flatMap((row, i) => (row.origin_station_id ? [] : [i]));
  let problem = null;
  if (rows.length < MIN_PARTICIPANTS || rows.length > MAX_PARTICIPANTS) problem = 'count';
  else if (tooLong.length) problem = 'tooLong';
  else if (duplicate.length) problem = 'duplicate';
  else if (missing.length) problem = 'station';
  return { ready: problem === null, problem, tooLong, duplicate, missing };
}

/**
 * 결과 화면에서 돌아오거나(#44) 임시저장(#17)을 이어서 할 때 저장했던 줄을 입력 줄로 되살린다.
 * 'N번'으로 채웠던 빈 닉네임은 다시 빈칸으로, 역 데이터에 없는 역 id(옛 데이터로 저장한 임시저장 등)는 비워 다시 고르게 한다
 * — 모르는 역 id가 결과 계산에 들어가면 시간이 NaN이 된다.
 * @param {Array<{participant_id?, nickname?, origin_station_id?}>} saved
 * @param {{isKnown?: (stationId: string) => boolean, nameFor?: (n: number) => string}} options
 */
export function restoreRows(saved, { isKnown = () => true, nameFor = defaultName } = {}) {
  return saved.map((p, i) => ({
    ...newParticipant(),
    ...p,
    nickname: p.nickname === nameFor(i + 1) ? '' : (p.nickname ?? ''),
    origin_station_id: p.origin_station_id && isKnown(p.origin_station_id) ? p.origin_station_id : null,
  }));
}

/** 다음 단계로 넘길 Participant[]. 빈 닉네임은 'N번'으로 채운다(share-link.js의 규칙과 같음). */
export function toParticipants(rows, nameFor = defaultName) {
  return rows.map((row, i) => ({
    participant_id: row.participant_id,
    nickname: displayName(row, i, nameFor),
    origin_station_id: row.origin_station_id,
  }));
}

/**
 * '링크로 입력받기'를 누를 때 로컬 줄을 나눈다.
 * 역까지 고른 줄은 방에 저장할 줄(save), 닉네임만 쓴 줄은 대신 입력 줄로 남기고(keep), 아무것도 안 쓴 줄은 버린다.
 */
export function splitRowsForRoom(rows) {
  return {
    save: rows.filter((r) => r.origin_station_id),
    keep: rows.filter((r) => !r.origin_station_id && String(r.nickname ?? '').trim()),
  };
}

const PROBLEM_COPY = {
  count: () => t('participants.countLimit'),
  tooLong: () => t('join.nicknameTooLong', { max: NICKNAME_MAX_LENGTH }),
  duplicate: () => t('join.nicknameTaken'),
  station: () => t('join.stationRequired'),
};

/** 'n명 중 m명 입력'. 최소 인원(3명)보다 적게 모였어도 n은 3으로 센다. */
export function progressOf(rows) {
  return { done: rows.filter((r) => r.origin_station_id).length, total: Math.max(MIN_PARTICIPANTS, rows.length) };
}

/**
 * '찾기'를 켤 수 있는지: 3~9명이고 모두 출발역이 있어야 한다. 방 모드에서는 총무만, 확정 전에만.
 * @param {Array<{origin_station_id}>} rows 방 참여자 + 아직 저장 안 한 줄
 */
export function canFind(rows, { isHost = true, confirmed = false } = {}) {
  return isHost && !confirmed
    && rows.length >= MIN_PARTICIPANTS && rows.length <= MAX_PARTICIPANTS
    && rows.every((r) => r.origin_station_id);
}

/** 참여자 목록이 바뀌었는지 비교하는 값. */
export function participantsSignature(participants) {
  return JSON.stringify(participants.map((p) => [p.participant_id, p.nickname, p.origin_station_id, p.updated_at]));
}

/**
 * 변화 추적: 목록이 그대로면 마지막 변화 시각을 유지하고, 바뀌었으면 지금으로 바꾼다.
 * idle=true면 POLL_STOP_AFTER_MS 동안 변화가 없었던 것이라 자동 확인을 멈춘다.
 * @param {{signature, changedAt}|null} previous
 */
export function trackChange(previous, participants, now = Date.now()) {
  const signature = participantsSignature(participants);
  const changedAt = previous && previous.signature === signature ? previous.changedAt : now;
  return { signature, changedAt, idle: now - changedAt >= POLL_STOP_AFTER_MS };
}

function lineBadges(lines = []) {
  return lines.map((line) => {
    const { label, background, color } = lineBadge(line);
    return el('span', {
      className: label.length > 1 ? 'badge two' : 'badge', textContent: label,
      title: `${line}`, style: `background:${background};color:${color}`,
    });
  });
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const stations = await loadData().then((d) => d.stations ?? []).catch(() => []);
  const stationById = (id) => stations.find((s) => s.id === id);

  let roomId = params.room_id ?? null;
  let hostToken = roomId ? getHostToken(roomId) : null;
  let joinUrl = params.join_url ?? null;
  let room = null; // 방 모드: 서버에서 읽은 { purpose, arrival_time, status, is_host, participants }

  // 방 모드의 줄은 '아직 방에 저장하지 않은 줄'(총무가 대신 입력하려고 추가한 줄)만 가진다. 로컬 모드는 기본 3줄.
  // 로컬 모드에서 결과 화면에서 돌아오면 params.participants로 입력을 이어 간다. 빈 닉네임으로 넘겼던 'N번'은 다시 빈칸으로 둔다.
  // 역 목록을 읽었을 때만 모르는 역 id를 비운다(못 읽었으면 어차피 고를 수도 없다).
  const rows = roomId ? [] : params.participants?.length
    ? restoreRows(params.participants, { isKnown: (id) => !stations.length || Boolean(stationById(id)) })
    : Array.from({ length: MIN_PARTICIPANTS }, newParticipant);
  while (!roomId && rows.length < MIN_PARTICIPANTS) rows.push(newParticipant());
  let openRow = null;     // 출발역 목록이 펼쳐진 줄
  let touched = false;    // 입력을 시작한 뒤부터 출발역 미선택 줄을 강조한다
  let message = '';       // 서버 저장·삭제 실패 안내
  let busy = false;       // 저장·삭제 요청 중
  let canInvite = false;  // 저장소가 연결되어 있을 때만 '링크로 입력받기'
  let inviting = false;   // 방을 만드는 중

  const { screen, foot, toast } = createShell(container);
  const lead = el('p', { className: 'lead', textContent: t('join.lead') });
  const linkBox = el('div');
  const progress = el('p', { className: 'meta', role: 'status' });
  const body = el('div', { className: 'people' });
  const notice = el('p', { className: 'error', role: 'alert' });
  const inviteBox = el('div', { className: 'people' });
  const idleBox = el('div', { className: 'idle-box' });
  screen.replaceChildren(
    el('div', { className: 'eyebrow', textContent: t('join.eyebrow') }),
    el('h2', { className: 'q big', textContent: t('join.title') }),
    lead, linkBox, progress, body, notice, inviteBox, idleBox,
  );

  // ---------- 방 모드: 서버에서 읽기 ----------
  // 방을 아직 못 읽었으면 총무 토큰이 있는지로 판단한다(방금 방을 만든 총무).
  const isHost = () => !roomId || (room ? room.is_host === true : Boolean(hostToken));
  const confirmed = () => room?.status === '확정';
  const remote = () => room?.participants ?? [];
  const allRows = () => [...remote(), ...rows];

  /** 화면에 영향을 주는 방 상태(참여자 목록·총무 여부·확정 여부)를 한 값으로. */
  const viewKey = (r) => (r ? JSON.stringify([participantsSignature(r.participants), r.is_host, r.status]) : '');

  let timer = null;
  let tracker = null;
  let idle = false;

  function stopPolling() {
    clearInterval(timer);
    timer = null;
  }

  function startPolling() {
    stopPolling();
    idle = false;
    tracker = trackChange(null, remote());
    timer = setInterval(poll, POLL_INTERVAL_MS);
  }

  /** 방 정보를 한 번 읽어 화면에 반영한다. 읽기에 실패하면 지난 목록을 그대로 둔다. */
  async function poll() {
    if (!screen.isConnected) return stopPolling(); // 다른 화면으로 넘어갔으면 더 읽지 않는다
    let next;
    try {
      next = await getRoom(roomId, hostToken);
    } catch {
      return;
    }
    if (!screen.isConnected) return stopPolling();
    if (next === null) { // 방이 만료되었거나 사라졌다
      stopPolling();
      foot.replaceChildren();
      return screen.replaceChildren(el('p', { textContent: t('link.invalid') }));
    }
    const before = viewKey(room);
    room = next;
    tracker = trackChange(tracker, remote());
    let changed = viewKey(room) !== before;
    if (confirmed()) stopPolling();
    else if (tracker.idle && !idle) { idle = true; stopPolling(); changed = true; }
    if (changed) update(); // 달라진 게 없으면 다시 그리지 않는다(누르는 중인 버튼이 사라지지 않게)
  }

  // ---------- 링크로 입력받기 (로컬 모드 → 방 모드) ----------
  /** 방을 만들고, 역까지 고른 줄은 방에 저장한 뒤 방 모드로 바꾼다. 방을 못 만들면 로컬 모드 그대로 둔다. */
  async function invite() {
    inviting = true;
    message = '';
    openRow = null;
    draw();
    const created = await createRoom(params.request);
    if (created.error) {
      inviting = false;
      message = t('meeting.inviteFailed');
      return draw();
    }
    setHostToken(created.room_id, created.host_token);
    clearDraft(); // 방이 생기면 입력은 서버에 있으므로 임시저장(#17)을 지운다
    // 내 약속 목록(#18)에 '입력 받는 중'으로 넣는다. 누르면 이 총무 화면(?room=)이 다시 열린다
    addRoomMeeting({ room_id: created.room_id, purpose: params.request.purpose, arrival_time: params.request.arrival_time, url: created.join_url });
    roomId = created.room_id;
    hostToken = created.host_token;
    joinUrl = created.join_url;
    // 방을 만드는 동안 [뒤로]로 돌아갔으면(#44) 떠난 화면의 주소를 바꾸거나 그 위에 그리지 않는다. 방은 내 약속 목록에서 다시 연다
    if (!screen.isConnected) return;
    // 주소를 방 링크로 바꿔 둔다. 새로고침하거나 다른 앱을 보고 돌아와도 main.js가 이 총무 화면을 다시 연다.
    history.replaceState(history.state, '', `?room=${encodeURIComponent(roomId)}`); // 뒤로가기 기록(state, #44)은 그대로 둔다

    const { save, keep } = splitRowsForRoom(rows);
    for (const row of save) { // 순서대로 저장해 명단 순서가 입력 순서와 같게 한다
      const result = await saveParticipant(roomId, row, hostToken);
      if (result.error) {
        row.origin_station_id = null; // 저장 못 한 줄은 대신 입력 줄로 남겨 다시 고르게 한다
        keep.push(row);
        message = t(SAVE_ERRORS[result.error] ?? 'join.saveFailed');
      }
    }
    rows.splice(0, rows.length, ...keep);
    inviting = false;
    try {
      room = await getRoom(roomId, hostToken);
    } catch {
      room = null; // 읽기에 실패해도 아래 자동 확인이 다시 읽는다
    }
    drawLink();
    draw();
    if (!confirmed()) startPolling();
  }

  async function onCopyLink() {
    const url = joinUrl ?? roomUrl(roomId);
    if (await copyLink(url)) return toast(t('meeting.copied'));
    toast(t('meeting.copyFailed'));
    linkBox.querySelector('input')?.select(); // 복사 권한이 없으면 링크를 선택해 직접 복사하게 한다
  }

  /** 방 모드에서 참여 링크와 복사 버튼을 보여준다(총무만). */
  function drawLink() {
    if (!roomId || !isHost() || confirmed()) return linkBox.replaceChildren();
    const url = joinUrl ?? roomUrl(roomId);
    const input = el('input', { type: 'text', readOnly: true, value: url, ariaLabel: t('meeting.linkReady') });
    input.addEventListener('focus', () => input.select());
    linkBox.replaceChildren(el('div', { className: 'link-box' }, [
      el('p', { className: 'lead', textContent: t('meeting.linkReady') }),
      input,
      el('button', { type: 'button', className: 'btn ghost', textContent: t('meeting.copyLink'), onclick: onCopyLink }),
    ]));
  }

  // ---------- 그리기 ----------
  function stationCell(row, isOpen, extra = []) {
    const station = stationById(row.origin_station_id);
    return el('div', { className: 'p-st' }, [
      el('span', {
        className: station ? 'lbl' : 'lbl empty',
        textContent: station ? t('join.stationName', { name: station.name }) : t('join.stationEmpty'),
      }),
      el('button', {
        type: 'button', className: 'pick', textContent: t(station ? 'join.change' : 'join.select'),
        ariaExpanded: String(isOpen), disabled: row.saving === true || inviting,
        onclick: () => {
          openRow = isOpen ? null : row;
          draw();
          if (openRow) body.querySelector('.picker input')?.focus();
        },
      }),
      ...extra,
    ]);
  }

  /**
   * 방 모드에서 아직 방에 저장하지 않은 줄(대신 입력하려고 추가한 줄)을 지운다(#95).
   * 서버에는 없는 줄이라 화면 목록에서만 뺀다. 이 버튼이 없으면 실수로 늘린 빈 줄 때문에 '찾기'가 계속 꺼져 있었다.
   */
  function removeLocalRow(row) {
    if (openRow === row) openRow = null;
    rows.splice(rows.indexOf(row), 1);
    message = '';
    draw();
  }

  /** 방 모드에서 총무가 대신 입력하는 줄: 역을 고르면 바로 방에 저장해 방 목록의 한 줄이 된다. */
  async function pickInRoom(row, stationId) {
    row.origin_station_id = stationId;
    row.saving = true;
    message = '';
    draw();
    const result = await saveParticipant(roomId, row, hostToken);
    row.saving = false;
    if (result.error) {
      row.origin_station_id = null;
      message = t(SAVE_ERRORS[result.error] ?? 'join.saveFailed');
      return draw();
    }
    rows.splice(rows.indexOf(row), 1);
    await poll();
    if (screen.isConnected && !confirmed()) startPolling(); // 방금 변화가 있었으니 10분 세기를 새로 시작한다
    update();
  }

  function picker(row) {
    const search = el('input', { type: 'search', placeholder: t('join.stationSearch'), ariaLabel: t('join.stationSearch') });
    const list = el('div', { className: 'st-list' });
    const fill = () => {
      const found = searchStations(stations, search.value);
      if (!found.length) return list.replaceChildren(el('div', { className: 'st-empty', textContent: t('station.noResult') }));
      list.replaceChildren(...found.map((s) => el('button', {
        type: 'button',
        className: s.id === row.origin_station_id ? 'st-item selected' : 'st-item',
        ariaLabel: `${s.name} (${s.lines.join('·')})`,
        onclick: () => {
          openRow = null;
          touched = true;
          if (roomId) return pickInRoom(row, s.id);
          row.origin_station_id = s.id;
          draw();
        },
      }, [el('span', { className: 'nm', textContent: t('join.stationName', { name: s.name }) }), ...lineBadges(s.lines)])));
    };
    search.addEventListener('input', fill);
    fill();
    const icon = el('span');
    icon.innerHTML = SEARCH_SVG;
    return el('div', { className: 'picker' }, [el('div', { className: 'search' }, [icon, search]), list]);
  }

  /** 총무가 방의 참여자 한 명을 지운다. */
  async function remove(participant) {
    busy = true;
    message = '';
    draw();
    const result = await deleteParticipant(roomId, participant.participant_id, hostToken);
    busy = false;
    if (result.error) {
      message = t(REMOVE_ERRORS[result.error] ?? 'participants.removeFailed');
      return draw();
    }
    await poll();
    if (screen.isConnected && !confirmed()) startPolling(); // 변화가 있었으니 10분 세기를 새로 시작한다
    update();
  }

  /** 방에 이미 저장된 참여자 줄 (읽기 전용, 총무는 삭제 가능) */
  function remoteRow(participant, index) {
    const station = stationById(participant.origin_station_id);
    return el('div', { className: 'person other' }, [
      el('div', { className: 'p-row' }, [
        characterNode(index, 'basic', 40),
        el('div', { className: 'p-name', textContent: participant.nickname }),
        el('div', { className: 'p-st' }, [
          el('span', {
            className: station ? 'lbl' : 'lbl empty',
            textContent: station ? t('join.stationName', { name: station.name }) : participant.origin_station_id,
          }),
          ...(isHost() && !confirmed() ? [el('button', {
            type: 'button', className: 'pick', textContent: t('participants.remove'),
            ariaLabel: t('participants.removeName', { name: participant.nickname }), disabled: busy,
            onclick: () => remove(participant),
          })] : []),
        ]),
      ]),
    ]);
  }

  /**
   * 입력 현황 문구·줄 강조·안내·'링크로 입력받기'·'찾기' 버튼 상태. 역 목록이 펼쳐진 동안에도 갱신할 수 있게 목록과 따로 그린다.
   * 닉네임을 칠 때마다 전체를 다시 그리면 입력칸 커서가 사라지므로, 입력 중에는 이것만 다시 그린다.
   */
  function drawStatus() {
    const all = allRows();
    // 방 없이 입력하는 동안은 줄이 바뀔 때마다(닉네임·역·인원) 0.5초 뒤 임시저장(#17). 방 모드는 서버에 있으므로 저장하지 않는다
    if (!roomId && params.request) {
      saveDraftSoon({
        request: params.request,
        ...(params.form ? { form: params.form } : {}),
        participants: rows.map(({ participant_id, nickname, origin_station_id }) => ({ participant_id, nickname, origin_station_id })),
      });
    }
    const check = checkParticipants(all);
    body.querySelectorAll('.person').forEach((node, i) => {
      node.classList.toggle('missing', touched && check.missing.includes(i));
      node.querySelector('input.p-name')?.classList.toggle('invalid', check.tooLong.includes(i) || check.duplicate.includes(i));
    });

    const { done, total } = progressOf(all);
    progress.textContent = roomId ? t('participants.progress', { done, total }) : '';
    progress.hidden = !roomId;
    lead.textContent = roomId ? t(isHost() ? 'participants.roomLead' : 'participants.viewOnly') : t('join.lead');
    // 방 모드는 사람이 모이는 중이라 3명 미만이 정상이므로 인원 문구는 띄우지 않는다(로컬 모드는 3~9명 밖으로 못 나감).
    const showProblem = check.problem && check.problem !== 'count' && (check.problem !== 'station' || touched);
    notice.textContent = confirmed() ? t('participants.roomConfirmed') : message || (showProblem ? PROBLEM_COPY[check.problem]() : '');

    inviteBox.replaceChildren(...(!roomId && canInvite && params.request ? [el('button', {
      type: 'button', className: 'btn ghost sm', disabled: inviting, onclick: invite,
      textContent: t(inviting ? 'meeting.inviting' : 'meeting.invite'),
    })] : []));

    idleBox.replaceChildren(...(roomId && idle ? [
      el('p', { className: 'hint', textContent: t('participants.pollStopped') }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('participants.refresh'), onclick: reloadRoom }),
    ] : []));

    if (roomId && (!isHost() || confirmed())) return foot.replaceChildren(); // 총무가 아니거나 이미 확정: 보기만
    const ready = check.ready && canFind(all, { isHost: isHost(), confirmed: confirmed() });
    const waiting = check.problem === 'station' || check.problem === 'count';
    foot.replaceChildren(el('button', {
      type: 'button', className: 'btn', disabled: !ready || busy || inviting,
      textContent: ready || !waiting ? t('participants.find') : t('participants.findWaiting', { done, total }),
      onclick: roomId ? find : findResult,
    }));
  }

  function drawList() {
    const offset = remote().length;
    const nodes = remote().map(remoteRow);
    nodes.push(...rows.map((row, i) => {
      const isOpen = openRow === row;
      const input = el('input', {
        type: 'text', className: 'p-name', maxLength: NICKNAME_MAX_LENGTH, value: row.nickname,
        placeholder: defaultName(offset + i + 1), ariaLabel: t('join.nicknamePlaceholder'), disabled: row.saving === true || inviting,
        oninput: () => { row.nickname = input.value; touched = true; drawStatus(); },
      });
      // 방 모드의 줄은 아직 저장 전이라 언제든 지울 수 있다(#95). 로컬 모드는 아래 '−' 버튼으로 줄인다
      const removeButton = roomId ? [el('button', {
        type: 'button', className: 'pick', textContent: t('participants.remove'),
        ariaLabel: t('participants.removeName', { name: displayName(row, offset + i) }), disabled: row.saving === true || inviting,
        onclick: () => removeLocalRow(row),
      })] : [];
      return el('div', { className: isOpen ? 'person mine open' : 'person mine' }, [
        el('div', { className: 'p-row' }, [characterNode(offset + i, 'basic', 40), input, stationCell(row, isOpen, removeButton)]),
        ...(isOpen ? [picker(row)] : []),
      ]);
    }));

    if (!roomId) {
      const atMax = rows.length >= MAX_PARTICIPANTS;
      nodes.push(el('div', { className: 'count' }, [
        el('button', {
          type: 'button', textContent: '−', ariaLabel: t('join.removePerson'), disabled: rows.length <= MIN_PARTICIPANTS || inviting,
          onclick: () => { if (openRow === rows[rows.length - 1]) openRow = null; rows.pop(); draw(); },
        }),
        el('span', { textContent: t('join.countLabel', { count: rows.length }) }),
        // 9명이면 '+'를 숨긴다. 자리는 남겨 두어 가운데 인원 표시가 움직이지 않게 한다.
        el('button', {
          type: 'button', textContent: '+', ariaLabel: t('join.addPerson'), disabled: atMax || inviting,
          style: atMax ? 'visibility:hidden' : '',
          onclick: () => { rows.push(newParticipant()); draw(); },
        }),
      ]));
    } else if (isHost() && !confirmed()) {
      nodes.push(el('button', {
        type: 'button', className: 'btn ghost sm', textContent: t('participants.addPerson'),
        disabled: allRows().length >= MAX_PARTICIPANTS || busy,
        onclick: () => { rows.push(newParticipant()); draw(); },
      }));
    }
    if (!roomId || rows.length) nodes.push(el('p', { className: 'hint', textContent: t('join.nicknameHint', { max: NICKNAME_MAX_LENGTH }) }));
    const chosen = [...remote(), ...rows].map((p) => stationById(p.origin_station_id));
    nodes.push(...rareServiceNotices(chosen).map((text) => el('p', { className: 'notice', textContent: text })));
    body.replaceChildren(...nodes);
  }

  function draw() {
    drawList();
    drawStatus();
  }

  /** 읽어 온 값을 반영한다. 역 목록(검색창)이 펼쳐져 있으면 입력 중인 내용이 지워지지 않게 목록은 건드리지 않는다. */
  function update() {
    if (!roomId || !isHost() || confirmed()) drawLink(); // 확정되면 링크 칸을 거둔다
    if (openRow) drawStatus();
    else draw();
  }

  async function reloadRoom() {
    tracker = null; // 새로고침하면 10분 세기를 다시 시작한다
    idle = false;
    await poll();
    if (!confirmed() && screen.isConnected) startPolling();
    update();
  }

  /** 로컬 모드: 입력한 줄로 결과 화면(#7)을 연다. 아직 없으면 안내만. */
  function findResult() {
    if (!checkParticipants(rows).ready) return drawStatus();
    const next = { ...params, participants: toParticipants(rows) };
    const fallback = () => toast(t('participants.findSoon'));
    try {
      // 결과에서 뒤로 돌아오면(#44) 입력한 줄(닉네임·역·인원)을 그대로 되살린다
      Promise.resolve(go(renderResult, container, next, { back: { ...params, participants: toParticipants(rows) } })).catch(fallback);
    } catch {
      fallback(); // 추천 결과 화면(#7)이 아직 없으면 안내만
    }
  }

  /** 방 모드: 방의 참여자 목록으로 결과 화면(#7)을 연다. 아직 없으면 안내만 하고 계속 갱신한다. */
  function find() {
    const participants = toParticipants(remote());
    const request = { purpose: room.purpose, arrival_time: room.arrival_time };
    const fallback = () => { toast(t('participants.findSoon')); if (!timer && !idle) startPolling(); };
    stopPolling();
    try {
      Promise.resolve(go(renderResult, container, { ...params, request, participants, room_id: roomId }, { back: { ...params, room_id: roomId } })).catch(fallback);
    } catch {
      fallback();
    }
  }

  // ---------- 시작 ----------
  if (!roomId) {
    draw();
    // 저장소 연결 여부는 화면을 먼저 보여준 뒤 확인한다. 서버가 없으면 버튼 없이 총무 일괄 입력만 쓴다(NFR-011).
    const status = await getStatus();
    if (status.rooms && !roomId) { canInvite = true; drawStatus(); }
    return;
  }

  try {
    room = await getRoom(roomId, hostToken);
  } catch {
    return screen.replaceChildren(el('p', { className: 'error', role: 'alert', textContent: t('join.loadFailed') }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('participants.refresh'), onclick: () => render(container, params) }));
  }
  if (room === null) return screen.replaceChildren(el('p', { textContent: t('link.invalid') }));
  if (confirmed()) { // 이미 확정된 방은 참여자 화면(join.js)과 같이 경로 화면으로 보낸다(같은 자리를 바꿈 → 뒤로가기는 그 전 화면, #44)
    try {
      return await replace(renderRoute, container, { room_id: roomId, room });
    } catch {
      return screen.replaceChildren(el('p', { textContent: t('join.confirmed') }));
    }
  }
  tracker = trackChange(null, remote());
  drawLink();
  draw();
  if (!confirmed()) startPolling();
}
