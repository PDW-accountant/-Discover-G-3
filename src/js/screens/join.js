// 참여자 직접 입력 (방 링크로 들어온 사람) (개발 A) — FUNC-022
// 모임 정보를 보여주고 닉네임·출발역을 입력받아 방에 저장. 같은 기기로 다시 오면 수정 가능.
// 문구는 lib/data.js의 t()로 읽는다.
// params: { room_id }. 방 정보는 getRoom(room_id) → { purpose, arrival_time, status, participants: RoomParticipant[] }

import { loadData, t } from '../lib/data.js';
import { getRoom, saveParticipant } from '../lib/api-client.js';
import { getParticipantId } from '../lib/storage.js';
import { searchStations } from '../lib/stations.js';
import { MAX_PARTICIPANTS, NICKNAME_MAX_LENGTH } from '../config.js';
import { render as renderRoute } from './route.js';
import { render as renderLinkError } from './link-error.js';

const ERROR_COPY = {
  full: 'join.full',
  duplicate_nickname: 'join.nicknameTaken',
  invalid: 'join.saveFailed',
  unavailable: 'join.saveFailed',
};

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showMessage(container, text) {
  container.replaceChildren(el('p', { textContent: text }));
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
  const participantId = getParticipantId();
  const participants = room.participants ?? [];
  const mine = participants.find((p) => p.participant_id === participantId);
  const otherNicknames = participants.filter((p) => p !== mine).map((p) => p.nickname);

  const header = [
    el('h1', { textContent: t('join.title') }),
    el('p', { textContent: t('join.purpose', { purpose: room.purpose }) }),
    el('p', { textContent: t('join.arrival', { time: formatArrival(room.arrival_time) }) }),
    el('p', { textContent: t('join.count', { count: participants.length, max: MAX_PARTICIPANTS }) }),
  ];
  if (!mine && participants.length >= MAX_PARTICIPANTS) {
    return container.replaceChildren(...header, el('p', { className: 'error', textContent: t('join.full') }));
  }

  let selectedId = mine?.origin_station_id ?? null;
  const stationName = (id) => stations.find((s) => s.id === id)?.name ?? id;

  const nicknameInput = el('input', { type: 'text', maxLength: NICKNAME_MAX_LENGTH, value: mine?.nickname ?? '' });
  const searchInput = el('input', { type: 'search', placeholder: t('join.stationSearch') });
  const selectedText = el('p');
  const list = el('ul', { className: 'station-list' });
  const errorText = el('p', { className: 'error', role: 'alert' });
  const saveButton = el('button', { type: 'submit', textContent: t('join.save') });

  function updateSelected() {
    selectedText.textContent = selectedId ? t('join.stationSelected', { name: stationName(selectedId) }) : '';
  }
  function updateList() {
    const found = sortedStations(stations, searchInput.value.trim());
    if (!found.length) return list.replaceChildren(el('li', { textContent: t('station.noResult') }));
    list.replaceChildren(...found.map((s) => el('li', {}, [
      el('button', {
        type: 'button',
        className: s.id === selectedId ? 'selected' : '',
        textContent: `${s.name} (${s.lines.join('·')})`,
        onclick: () => { selectedId = s.id; errorText.textContent = ''; updateSelected(); updateList(); },
      }),
    ])));
  }
  searchInput.addEventListener('input', updateList);

  const form = el('form', {}, [
    el('label', {}, [t('join.nickname', { max: NICKNAME_MAX_LENGTH }), nicknameInput]),
    el('label', {}, [t('join.station'), searchInput]),
    selectedText,
    list,
    errorText,
    saveButton,
  ]);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = nicknameInput.value.trim();
    errorText.textContent = '';
    if (Array.from(nickname).length > NICKNAME_MAX_LENGTH) {
      errorText.textContent = t('join.nicknameTooLong', { max: NICKNAME_MAX_LENGTH });
      return;
    }
    if (nickname && otherNicknames.includes(nickname)) {
      errorText.textContent = t('join.nicknameTaken');
      return;
    }
    if (!selectedId) {
      errorText.textContent = t('join.stationRequired');
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = t('join.saving');
    const result = await saveParticipant(roomId, {
      participant_id: participantId, nickname, origin_station_id: selectedId,
    });
    saveButton.disabled = false;
    saveButton.textContent = t('join.save');

    // 저장 사이에 방이 확정되었거나 사라졌으면 처음부터 다시 열어 알맞은 화면으로 보낸다.
    if (result.error === 'confirmed' || result.error === 'not_found') return render(container, params);
    if (result.error) {
      errorText.textContent = t(ERROR_COPY[result.error] ?? 'join.saveFailed');
      return;
    }
    container.replaceChildren(
      el('h1', { textContent: t('join.title') }),
      el('p', { textContent: t('join.saved', { nickname: result.nickname, station: stationName(result.origin_station_id) }) }),
      el('p', { textContent: t('join.done') }),
      el('button', { type: 'button', textContent: t('join.edit'), onclick: () => render(container, params) }),
    );
  });

  updateSelected();
  updateList();
  container.replaceChildren(...header, form);
}
