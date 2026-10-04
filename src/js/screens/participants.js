// ② 출발역 입력 (총무 화면) (개발 A) — FUNC-002, FUNC-003, FUNC-023
// 참여자 3~9명, 닉네임 6자 이내·중복 불가, 출발역 검색. 방이 있으면 5초마다 입력 현황(n명 중 m명) 갱신. 조건이 맞으면 '찾기' 활성화.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 출발지 입력 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, room_id?, join_url? } — 첫 화면(meeting-form)에서 넘어온다.
// 참여자 줄: { participant_id, nickname, origin_station_id } — recommend.js·서버 저장과 같은 이름.
// 이번 구현(#3, FUNC-002): 기본 3줄마다 출발역 검색·선택, 고른 역을 그 줄에 표시.
// 닉네임 입력·사람 추가/삭제·'찾기' 동작은 FUNC-003(#4), 입력 현황 갱신은 FUNC-023(#21)에서 붙인다.

import { loadData, t } from '../lib/data.js';
import { lineBadge, searchStations } from '../lib/stations.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { MIN_PARTICIPANTS } from '../config.js';

const SEARCH_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/** 참여자 줄 하나. participant_id는 무작위 문자열(공유 링크·각자 입력과 같은 형식). */
export function newParticipant() {
  return { participant_id: `p_${crypto.randomUUID().replace(/-/g, '')}`, nickname: '', origin_station_id: null };
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

  const rows = params.participants?.length
    ? params.participants.map((p) => ({ ...newParticipant(), ...p }))
    : Array.from({ length: MIN_PARTICIPANTS }, newParticipant);
  let openRow = null; // 출발역 목록이 펼쳐진 줄

  const { screen, foot, toast } = createShell(container);
  const body = el('div', { className: 'people' });
  screen.replaceChildren(
    el('div', { className: 'eyebrow', textContent: t('join.eyebrow') }),
    el('h2', { className: 'q big', textContent: t('join.title') }),
    el('p', { className: 'lead', textContent: t('join.lead') }),
    body,
  );

  function stationCell(row, isOpen) {
    const station = stationById(row.origin_station_id);
    return el('div', { className: 'p-st' }, [
      el('span', {
        className: station ? 'lbl' : 'lbl empty',
        textContent: station ? t('join.stationName', { name: station.name }) : t('join.stationEmpty'),
      }),
      el('button', {
        type: 'button', className: 'pick', textContent: t(station ? 'join.change' : 'join.select'),
        ariaExpanded: String(isOpen),
        onclick: () => {
          openRow = isOpen ? null : row;
          draw();
          if (openRow) body.querySelector('.picker input')?.focus();
        },
      }),
    ]);
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
        onclick: () => { row.origin_station_id = s.id; openRow = null; draw(); },
      }, [el('span', { className: 'nm', textContent: t('join.stationName', { name: s.name }) }), ...lineBadges(s.lines)])));
    };
    search.addEventListener('input', fill);
    fill();
    const icon = el('span');
    icon.innerHTML = SEARCH_SVG;
    return el('div', { className: 'picker' }, [el('div', { className: 'search' }, [icon, search]), list]);
  }

  function draw() {
    body.replaceChildren(...rows.map((row, i) => {
      const isOpen = openRow === row;
      return el('div', { className: isOpen ? 'person mine open' : 'person mine' }, [
        el('div', { className: 'p-row' }, [
          characterNode(i, 'basic', 40),
          // FUNC-003(#4)에서 닉네임 입력칸으로 바꾼다. 지금은 비어 있을 때의 이름('1번' 등)만 보여준다.
          el('div', { className: 'p-name', textContent: row.nickname || t('participants.defaultName', { n: i + 1 }) }),
          stationCell(row, isOpen),
        ]),
        ...(isOpen ? [picker(row)] : []),
      ]);
    }));

    const done = rows.filter((r) => r.origin_station_id).length;
    const ready = done === rows.length;
    foot.replaceChildren(el('button', {
      type: 'button', className: 'btn', disabled: !ready,
      textContent: ready ? t('participants.find') : t('participants.findWaiting', { done, total: rows.length }),
      onclick: () => toast(t('participants.findSoon')), // FUNC-003(#4)에서 추천 결과 화면으로 연결
    }));
  }

  draw();
}
