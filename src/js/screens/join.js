// 참여자 직접 입력 (방 링크로 들어온 사람) (개발 A) — FUNC-022
// 모임 정보를 보여주고 닉네임·출발역을 입력받아 방에 저장. 같은 기기로 다시 오면 수정 가능.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 출발지 입력 화면을 따른다.
// params: { room_id }. 방 정보는 getRoom(room_id) → { purpose, arrival_time, status, participants: RoomParticipant[] }
// 한 기기에서 여러 명을 넣을 수 있다. 이 기기의 참여자 id는 getParticipantId()와 그 뒤에 _2, _3…을 붙인 값.
// 이미 저장된 사람 삭제는 총무만 할 수 있어(FUNC-023) 여기서는 저장 전 줄만 뺀다.

import { loadData, t } from '../lib/data.js';
import { getRoom, saveParticipant } from '../lib/api-client.js';
import { getParticipantId } from '../lib/storage.js';
import { searchStations } from '../lib/stations.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH } from '../config.js';
import { render as renderRoute } from './route.js';
import { render as renderLinkError } from './link-error.js';

const ERROR_COPY = {
  full: 'join.full',
  duplicate_nickname: 'join.nicknameTaken',
  invalid: 'join.saveFailed',
  unavailable: 'join.saveFailed',
};

// 호선 표시: [동그라미 안 글자, 노선 색, 글자 색]
const LINE_BADGES = {
  1: ['1', '#0052A4', '#fff'], 2: ['2', '#00A84D', '#fff'], 3: ['3', '#EF7C1C', '#fff'], 4: ['4', '#00A5DE', '#fff'],
  5: ['5', '#996CAC', '#fff'], 6: ['6', '#CD7C2F', '#fff'], 7: ['7', '#747F00', '#fff'], 8: ['8', '#E6186C', '#fff'],
  9: ['9', '#BDB092', '#000'],
  신분당: ['신분', '#D4003B', '#fff'], 공항철도: ['공항', '#0090D2', '#fff'], 경의중앙: ['경의', '#77C4A3', '#000'],
  수인분당: ['수인', '#F5A200', '#000'], 신림: ['신림', '#6789CA', '#fff'], 우이신설: ['우이', '#B0CE18', '#000'],
  경춘: ['경춘', '#0C8E72', '#fff'],
};

const SEARCH_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function showMessage(container, text) {
  createShell(container).screen.replaceChildren(el('p', { textContent: text }));
}

/** 다른 화면을 연다. 그 화면이 아직 없거나 실패하면 안내 문구만 보여준다. */
function openScreen(renderFn, container, params, fallbackText) {
  try {
    Promise.resolve(renderFn(container, params)).catch(() => showMessage(container, fallbackText));
  } catch {
    showMessage(container, fallbackText);
  }
}

function formatArrival(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value ?? '');
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sortedStations(stations, keyword) {
  try {
    return searchStations(stations, keyword);
  } catch {
    // FUNC-002(#3) 구현 전: 검색 없이 가나다 순 전체 목록
    return [...stations].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
}

function lineBadges(lines = []) {
  return lines.map((line) => {
    const [label, background, color] = LINE_BADGES[line] ?? [line, '#8c959f', '#fff'];
    return el('span', {
      className: label.length > 1 ? 'badge two' : 'badge', textContent: label,
      title: `${line}`, style: `background:${background};color:${color}`,
    });
  });
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const roomId = params.room_id;
  let room;
  try {
    room = await getRoom(roomId);
  } catch {
    return showMessage(container, t('join.loadFailed'));
  }
  if (!room) return openScreen(renderLinkError, container, params, t('link.invalid'));
  if (room.status === '확정') return openScreen(renderRoute, container, { room_id: roomId, room }, t('join.confirmed'));

  const stations = await loadData().then((d) => d.stations ?? []).catch(() => []);
  const stationById = (id) => stations.find((s) => s.id === id);
  const deviceId = getParticipantId();
  const isMine = (id) => id === deviceId || id.startsWith(`${deviceId}_`);
  const participants = room.participants ?? [];
  const others = participants.filter((p) => !isMine(p.participant_id));

  // 이 기기에서 입력하는 줄들. saved: 이미 방에 저장된 줄(빼기 불가)
  const rows = participants.filter((p) => isMine(p.participant_id)).map((p) => ({ ...p, saved: true }));
  if (!rows.length) rows.push({ participant_id: deviceId, nickname: '', origin_station_id: null, saved: false });
  let openRow = null; // 출발역 목록이 펼쳐진 줄
  let message = '';

  const { screen, foot } = createShell(container);
  const intro = [
    el('div', { className: 'eyebrow', textContent: t('join.eyebrow') }),
    el('h2', { className: 'q big', textContent: t('join.title') }),
    el('p', { className: 'lead', textContent: t('join.lead') }),
    el('p', { className: 'meta', textContent: t('join.purpose', { purpose: room.purpose }) }),
    el('p', { className: 'meta', textContent: t('join.arrival', { time: formatArrival(room.arrival_time) }) }),
    el('p', { className: 'meta', textContent: t('join.count', { count: participants.length, max: MAX_PARTICIPANTS }) }),
  ];
  if (!participants.some((p) => isMine(p.participant_id)) && participants.length >= MAX_PARTICIPANTS) {
    return screen.replaceChildren(...intro, el('p', { className: 'error', textContent: t('join.full') }));
  }

  const body = el('div', { className: 'people' });
  screen.replaceChildren(...intro, body);

  function nextParticipantId() {
    const used = new Set([...participants.map((p) => p.participant_id), ...rows.map((r) => r.participant_id)]);
    if (!used.has(deviceId)) return deviceId;
    let k = 2;
    while (used.has(`${deviceId}_${k}`)) k += 1;
    return `${deviceId}_${k}`;
  }

  function stationCell(stationId, onSelect, isOpen = false) {
    const station = stationById(stationId);
    return el('div', { className: 'p-st' }, [
      el('span', {
        className: station ? 'lbl' : 'lbl empty',
        textContent: station ? t('join.stationName', { name: station.name }) : (stationId || t('join.stationEmpty')),
      }),
      ...(onSelect ? [el('button', {
        type: 'button', className: 'pick', textContent: t(station ? 'join.change' : 'join.select'),
        ariaExpanded: String(isOpen), onclick: onSelect,
      })] : []),
    ]);
  }

  function picker(row) {
    const search = el('input', { type: 'search', placeholder: t('join.stationSearch'), ariaLabel: t('join.stationSearch') });
    const list = el('div', { className: 'st-list' });
    const fill = () => {
      const found = sortedStations(stations, search.value.trim());
      if (!found.length) return list.replaceChildren(el('div', { className: 'st-empty', textContent: t('station.noResult') }));
      list.replaceChildren(...found.map((s) => el('button', {
        type: 'button',
        className: s.id === row.origin_station_id ? 'st-item selected' : 'st-item',
        ariaLabel: `${s.name} (${s.lines.join('·')})`,
        onclick: () => { row.origin_station_id = s.id; openRow = null; message = ''; draw(); },
      }, [el('span', { className: 'nm', textContent: t('join.stationName', { name: s.name }) }), ...lineBadges(s.lines)])));
    };
    search.addEventListener('input', fill);
    fill();
    const icon = el('span');
    icon.innerHTML = SEARCH_SVG;
    return el('div', { className: 'picker' }, [el('div', { className: 'search' }, [icon, search]), list]);
  }

  function draw() {
    const rowNodes = [];
    let index = 0;
    for (const p of others) {
      rowNodes.push(el('div', { className: 'person other' }, [
        el('div', { className: 'p-row' }, [
          characterNode(index, 'basic', 40),
          el('div', { className: 'p-name', textContent: p.nickname }),
          stationCell(p.origin_station_id),
        ]),
      ]));
      index += 1;
    }
    for (const row of rows) {
      const input = el('input', {
        type: 'text', className: 'p-name', maxLength: NICKNAME_MAX_LENGTH, value: row.nickname,
        placeholder: t('join.nicknamePlaceholder'), ariaLabel: t('join.nicknamePlaceholder'),
        oninput: () => { row.nickname = input.value; },
      });
      const isOpen = openRow === row;
      rowNodes.push(el('div', { className: isOpen ? 'person mine open' : 'person mine' }, [
        el('div', { className: 'p-row' }, [
          characterNode(index, 'basic', 40),
          input,
          stationCell(row.origin_station_id, () => { openRow = isOpen ? null : row; draw(); if (openRow) body.querySelector('.picker input')?.focus(); }, isOpen),
        ]),
        ...(isOpen ? [picker(row)] : []),
      ]));
      index += 1;
    }

    const total = others.length + rows.length;
    const lastRow = rows[rows.length - 1];
    const canRemove = rows.length > 1 && !lastRow.saved;
    body.replaceChildren(
      ...rowNodes,
      el('div', { className: 'count' }, [
        el('button', {
          type: 'button', textContent: '−', ariaLabel: t('join.removePerson'), disabled: !canRemove,
          onclick: () => { if (openRow === lastRow) openRow = null; rows.pop(); draw(); },
        }),
        el('span', { textContent: t('join.countLabel', { count: total }) }),
        el('button', {
          type: 'button', textContent: '+', ariaLabel: t('join.addPerson'), disabled: total >= MAX_PARTICIPANTS,
          onclick: () => { rows.push({ participant_id: nextParticipantId(), nickname: '', origin_station_id: null, saved: false }); draw(); },
        }),
      ]),
      el('p', { className: 'hint', textContent: t('join.nicknameHint', { max: NICKNAME_MAX_LENGTH }) }),
      el('p', { className: 'error', role: 'alert', textContent: message }),
    );
    foot.replaceChildren(el('button', { type: 'button', className: 'btn', textContent: t('join.save'), onclick: save }));
  }

  function validate() {
    const otherNames = others.map((p) => p.nickname);
    const names = rows.map((r) => r.nickname.trim());
    for (const [i, name] of names.entries()) {
      if (Array.from(name).length > NICKNAME_MAX_LENGTH) return t('join.nicknameTooLong', { max: NICKNAME_MAX_LENGTH });
      if (name && (otherNames.includes(name) || names.indexOf(name) !== i)) return t('join.nicknameTaken');
    }
    if (rows.some((r) => !r.origin_station_id)) return t('join.stationRequired');
    return '';
  }

  async function save(event) {
    message = validate();
    if (message) return draw();
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = t('join.saving');
    for (const row of rows) {
      const result = await saveParticipant(roomId, {
        participant_id: row.participant_id, nickname: row.nickname.trim(), origin_station_id: row.origin_station_id,
      });
      // 저장 사이에 방이 확정되었거나 사라졌으면 처음부터 다시 열어 알맞은 화면으로 보낸다.
      if (result.error === 'confirmed' || result.error === 'not_found') return render(container, params);
      if (result.error) {
        message = t(ERROR_COPY[result.error] ?? 'join.saveFailed');
        return draw();
      }
      Object.assign(row, result, { saved: true }); // 빈 닉네임이면 서버가 정한 '1번' 등으로 바뀐다
    }
    const done = createShell(container);
    done.screen.replaceChildren(
      el('div', { className: 'crew' }, rows.slice(0, 5).map((_, i) => characterNode(others.length + i, 'happy', 64))),
      el('h2', { className: 'q', textContent: t('join.done') }),
      ...rows.map((row, i) => el('div', { className: 'person mine' }, [
        el('div', { className: 'p-row' }, [
          characterNode(others.length + i, 'basic', 40),
          el('div', { className: 'p-name', textContent: row.nickname }),
          stationCell(row.origin_station_id),
        ]),
      ])),
    );
    done.foot.replaceChildren(el('button', { type: 'button', className: 'btn', textContent: t('join.edit'), onclick: () => render(container, params) }));
  }

  draw();
}
