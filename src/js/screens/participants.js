// ② 출발역 입력 (총무 화면) (개발 A) — FUNC-002, FUNC-003, FUNC-023
// 참여자 3~9명, 닉네임 6자 이내·중복 불가, 출발역 검색. 방이 있으면 5초마다 입력 현황(n명 중 m명) 갱신. 조건이 맞으면 '찾기' 활성화.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 출발지 입력 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, room_id?, join_url? } — 첫 화면(meeting-form)에서 넘어온다.
// 참여자 줄: { participant_id, nickname, origin_station_id } — recommend.js·서버 저장과 같은 이름.
// 이번 구현(#3, FUNC-002): 기본 3줄마다 출발역 검색·선택, 고른 역을 그 줄에 표시.
// 이번 구현(#21, FUNC-023): params.room_id가 있으면 '방 모드'. 방의 참여자 목록을 5초마다 읽어 명단·'n명 중 m명'을 보여주고,
//   총무는 삭제와 대신 입력(역을 고르면 바로 방에 저장)을 하고, 총무가 아니면 보기만 한다. 10분 동안 변화가 없으면 자동 확인을 멈추고 새로고침 버튼을 보여준다.
//   '찾기'는 방의 참여자 목록으로 결과 화면(#7, result.js)을 연다. 방이 없으면 아래 로컬 모드가 그대로 동작한다.
// 닉네임 입력·사람 추가/삭제(로컬 줄)·로컬 모드의 '찾기' 동작은 FUNC-003(#4)에서 붙인다.

import { loadData, t } from '../lib/data.js';
import { lineBadge, searchStations } from '../lib/stations.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { getRoom, saveParticipant, deleteParticipant } from '../lib/api-client.js';
import { getHostToken } from '../lib/storage.js';
import { MIN_PARTICIPANTS, MAX_PARTICIPANTS, POLL_INTERVAL_MS, POLL_STOP_AFTER_MS } from '../config.js';
import { render as renderResult } from './result.js';

const SEARCH_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

// 서버가 돌려주는 거절 이유 → 안내 문구 키
const SAVE_ERRORS = { full: 'join.full', confirmed: 'participants.roomConfirmed', not_found: 'link.invalid' };
const REMOVE_ERRORS = { forbidden: 'participants.forbidden', confirmed: 'participants.roomConfirmed', not_found: 'link.invalid' };

/** 참여자 줄 하나. participant_id는 무작위 문자열(공유 링크·각자 입력과 같은 형식). */
export function newParticipant() {
  return { participant_id: `p_${crypto.randomUUID().replace(/-/g, '')}`, nickname: '', origin_station_id: null };
}

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

  const roomId = params.room_id ?? null;
  const hostToken = roomId ? getHostToken(roomId) : null;
  let room = null; // 방 모드: 서버에서 읽은 { purpose, arrival_time, status, is_host, participants }

  // 방 모드의 줄은 '아직 방에 저장하지 않은 줄'(총무가 대신 입력하려고 추가한 줄)만 가진다. 로컬 모드는 기본 3줄.
  const rows = roomId ? [] : params.participants?.length
    ? params.participants.map((p) => ({ ...newParticipant(), ...p }))
    : Array.from({ length: MIN_PARTICIPANTS }, newParticipant);
  let openRow = null; // 출발역 목록이 펼쳐진 줄
  let message = '';
  let busy = false;   // 저장·삭제 요청 중

  const { screen, foot, toast } = createShell(container);
  const lead = el('p', { className: 'lead', textContent: t('join.lead') });
  const progress = el('p', { className: 'meta', role: 'status' });
  const body = el('div', { className: 'people' });
  const notice = el('p', { className: 'error', role: 'alert' });
  const idleBox = el('div', { className: 'idle-box' });
  screen.replaceChildren(
    el('div', { className: 'eyebrow', textContent: t('join.eyebrow') }),
    el('h2', { className: 'q big', textContent: t('join.title') }),
    lead, progress, body, notice, idleBox,
  );

  // ---------- 방 모드: 서버에서 읽기 ----------
  const isHost = () => !roomId || room?.is_host === true;
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

  // ---------- 그리기 ----------
  function stationCell(row, isOpen) {
    const station = stationById(row.origin_station_id);
    return el('div', { className: 'p-st' }, [
      el('span', {
        className: station ? 'lbl' : 'lbl empty',
        textContent: station ? t('join.stationName', { name: station.name }) : t('join.stationEmpty'),
      }),
      el('button', {
        type: 'button', className: 'pick', textContent: t(station ? 'join.change' : 'join.select'),
        ariaExpanded: String(isOpen), disabled: row.saving === true,
        onclick: () => {
          openRow = isOpen ? null : row;
          draw();
          if (openRow) body.querySelector('.picker input')?.focus();
        },
      }),
    ]);
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

  /** 입력 현황 문구·안내·'찾기' 버튼 상태. 역 목록이 펼쳐진 동안에도 갱신할 수 있게 목록과 따로 그린다. */
  function drawStatus() {
    const { done, total } = progressOf(allRows());
    progress.textContent = roomId ? t('participants.progress', { done, total }) : '';
    progress.hidden = !roomId;
    if (roomId) lead.textContent = t(isHost() ? 'participants.roomLead' : 'participants.viewOnly');
    notice.textContent = confirmed() ? t('participants.roomConfirmed') : message;

    idleBox.replaceChildren(...(roomId && idle ? [
      el('p', { className: 'hint', textContent: t('participants.pollStopped') }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('participants.refresh'), onclick: refresh }),
    ] : []));

    if (roomId && (!isHost() || confirmed())) return foot.replaceChildren(); // 총무가 아니거나 이미 확정: 보기만
    const ready = canFind(allRows(), { isHost: isHost(), confirmed: confirmed() });
    foot.replaceChildren(el('button', {
      type: 'button', className: 'btn', disabled: !ready || busy,
      textContent: ready ? t('participants.find') : t('participants.findWaiting', { done, total }),
      onclick: roomId ? find : () => toast(t('participants.findSoon')), // 로컬 모드는 FUNC-003(#4)에서 추천 결과 화면으로 연결
    }));
  }

  function drawList() {
    const offset = remote().length;
    const nodes = remote().map(remoteRow);
    nodes.push(...rows.map((row, i) => {
      const isOpen = openRow === row;
      return el('div', { className: isOpen ? 'person mine open' : 'person mine' }, [
        el('div', { className: 'p-row' }, [
          characterNode(offset + i, 'basic', 40),
          // FUNC-003(#4)에서 닉네임 입력칸으로 바꾼다. 지금은 비어 있을 때의 이름('1번' 등)만 보여준다.
          el('div', { className: 'p-name', textContent: row.nickname || t('participants.defaultName', { n: offset + i + 1 }) }),
          stationCell(row, isOpen),
        ]),
        ...(isOpen ? [picker(row)] : []),
      ]);
    }));
    if (roomId && isHost() && !confirmed()) {
      nodes.push(el('button', {
        type: 'button', className: 'btn ghost sm', textContent: t('participants.addPerson'),
        disabled: allRows().length >= MAX_PARTICIPANTS || busy,
        onclick: () => { rows.push(newParticipant()); draw(); },
      }));
    }
    body.replaceChildren(...nodes);
  }

  function draw() {
    drawList();
    drawStatus();
  }

  /** 읽어 온 값을 반영한다. 역 목록(검색창)이 펼쳐져 있으면 입력 중인 내용이 지워지지 않게 목록은 건드리지 않는다. */
  function update() {
    if (openRow) drawStatus();
    else draw();
  }

  async function refresh() {
    tracker = null; // 새로고침하면 10분 세기를 다시 시작한다
    idle = false;
    await poll();
    if (!confirmed() && screen.isConnected) startPolling();
    update();
  }

  /** 방의 참여자 목록으로 결과 화면(#7)을 연다. 아직 없으면 안내만 하고 계속 갱신한다. */
  function find() {
    const participants = remote().map(({ participant_id, nickname, origin_station_id }) => ({ participant_id, nickname, origin_station_id }));
    const request = { purpose: room.purpose, arrival_time: room.arrival_time };
    const fallback = () => { toast(t('participants.findSoon')); if (!timer && !idle) startPolling(); };
    stopPolling();
    try {
      Promise.resolve(renderResult(container, { ...params, request, participants, room_id: roomId })).catch(fallback);
    } catch {
      fallback();
    }
  }

  // ---------- 시작 ----------
  if (!roomId) return draw();

  try {
    room = await getRoom(roomId, hostToken);
  } catch {
    return screen.replaceChildren(el('p', { className: 'error', role: 'alert', textContent: t('join.loadFailed') }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('participants.refresh'), onclick: () => render(container, params) }));
  }
  if (room === null) return screen.replaceChildren(el('p', { textContent: t('link.invalid') }));
  tracker = trackChange(null, remote());
  draw();
  if (!confirmed()) startPolling();
}
