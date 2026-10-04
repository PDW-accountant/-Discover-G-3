// ② 출발역 입력 (총무 화면) (개발 A) — FUNC-002, FUNC-003, FUNC-023
// 참여자 3~9명, 닉네임 6자 이내·중복 불가, 출발역 검색. 방이 있으면 5초마다 입력 현황(n명 중 m명) 갱신. 조건이 맞으면 '찾기' 활성화.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 출발지 입력 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, room_id?, join_url?, participants?: Participant[] } — 첫 화면(meeting-form)에서 넘어온다.
// 참여자 줄: { participant_id, nickname, origin_station_id } — recommend.js·share-link.js·서버 저장과 같은 이름.
// FUNC-002(#3): 줄마다 출발역 검색·선택. FUNC-003(#4): 닉네임(비우면 'N번', 중복 불가), 인원 3~9명 조절, '찾기' → 추천 결과(result).
// 입력 현황 갱신(FUNC-023, #21)은 rows 배열 하나에 방 참여자를 합쳐 넣는 방식으로 붙인다.

import { loadData, t } from '../lib/data.js';
import { lineBadge, searchStations } from '../lib/stations.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { MAX_PARTICIPANTS, MIN_PARTICIPANTS, NICKNAME_MAX_LENGTH } from '../config.js';
import { render as renderResult } from './result.js';

const SEARCH_SVG = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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

/** 다음 단계로 넘길 Participant[]. 빈 닉네임은 'N번'으로 채운다(share-link.js의 규칙과 같음). */
export function toParticipants(rows, nameFor = defaultName) {
  return rows.map((row, i) => ({
    participant_id: row.participant_id,
    nickname: displayName(row, i, nameFor),
    origin_station_id: row.origin_station_id,
  }));
}

const PROBLEM_COPY = {
  count: () => t('participants.countLimit'),
  tooLong: () => t('join.nicknameTooLong', { max: NICKNAME_MAX_LENGTH }),
  duplicate: () => t('join.nicknameTaken'),
  station: () => t('join.stationRequired'),
};

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

  // 결과 화면에서 돌아오면 params.participants로 입력을 이어 간다. 빈 닉네임으로 넘겼던 'N번'은 다시 빈칸으로 둔다.
  const rows = params.participants?.length
    ? params.participants.map((p, i) => ({
      ...newParticipant(), ...p, nickname: p.nickname === defaultName(i + 1) ? '' : (p.nickname ?? ''),
    }))
    : Array.from({ length: MIN_PARTICIPANTS }, newParticipant);
  while (rows.length < MIN_PARTICIPANTS) rows.push(newParticipant());
  let openRow = null;   // 출발역 목록이 펼쳐진 줄
  let touched = false;  // 입력을 시작한 뒤부터 출발역 미선택 줄을 강조한다

  const { screen, foot, toast } = createShell(container);
  const body = el('div', { className: 'people' });
  const message = el('p', { className: 'error', role: 'alert' });
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
        onclick: () => { row.origin_station_id = s.id; openRow = null; touched = true; draw(); },
      }, [el('span', { className: 'nm', textContent: t('join.stationName', { name: s.name }) }), ...lineBadges(s.lines)])));
    };
    search.addEventListener('input', fill);
    fill();
    const icon = el('span');
    icon.innerHTML = SEARCH_SVG;
    return el('div', { className: 'picker' }, [el('div', { className: 'search' }, [icon, search]), list]);
  }

  function findResult() {
    if (!checkParticipants(rows).ready) return refresh();
    const next = { ...params, participants: toParticipants(rows) };
    const fallback = () => toast(t('participants.findSoon'));
    try {
      Promise.resolve(renderResult(container, next)).catch(fallback);
    } catch {
      fallback(); // 추천 결과 화면(#7)이 아직 없으면 안내만
    }
  }

  // 닉네임을 칠 때마다 전체를 다시 그리면 입력칸 커서가 사라지므로, 강조·문구·버튼만 고친다.
  function refresh() {
    const check = checkParticipants(rows);
    body.querySelectorAll('.person').forEach((node, i) => {
      node.classList.toggle('missing', touched && check.missing.includes(i));
      node.querySelector('input.p-name')?.classList.toggle('invalid', check.tooLong.includes(i) || check.duplicate.includes(i));
    });
    const showProblem = check.problem && (check.problem !== 'station' || touched);
    message.textContent = showProblem ? PROBLEM_COPY[check.problem]() : '';

    const done = rows.length - check.missing.length;
    foot.replaceChildren(el('button', {
      type: 'button', className: 'btn', disabled: !check.ready, onclick: findResult,
      textContent: check.ready || check.problem !== 'station'
        ? t('participants.find')
        : t('participants.findWaiting', { done, total: rows.length }),
    }));
  }

  function draw() {
    const rowNodes = rows.map((row, i) => {
      const isOpen = openRow === row;
      const input = el('input', {
        type: 'text', className: 'p-name', maxLength: NICKNAME_MAX_LENGTH, value: row.nickname,
        placeholder: defaultName(i + 1), ariaLabel: t('join.nicknamePlaceholder'),
        oninput: () => { row.nickname = input.value; touched = true; refresh(); },
      });
      return el('div', { className: isOpen ? 'person mine open' : 'person mine' }, [
        el('div', { className: 'p-row' }, [characterNode(i, 'basic', 40), input, stationCell(row, isOpen)]),
        ...(isOpen ? [picker(row)] : []),
      ]);
    });

    const atMax = rows.length >= MAX_PARTICIPANTS;
    body.replaceChildren(
      ...rowNodes,
      el('div', { className: 'count' }, [
        el('button', {
          type: 'button', textContent: '−', ariaLabel: t('join.removePerson'), disabled: rows.length <= MIN_PARTICIPANTS,
          onclick: () => { if (openRow === rows[rows.length - 1]) openRow = null; rows.pop(); draw(); },
        }),
        el('span', { textContent: t('join.countLabel', { count: rows.length }) }),
        // 9명이면 '+'를 숨긴다. 자리는 남겨 두어 가운데 인원 표시가 움직이지 않게 한다.
        el('button', {
          type: 'button', textContent: '+', ariaLabel: t('join.addPerson'), disabled: atMax,
          style: atMax ? 'visibility:hidden' : '',
          onclick: () => { rows.push(newParticipant()); draw(); },
        }),
      ]),
      el('p', { className: 'hint', textContent: t('join.nicknameHint', { max: NICKNAME_MAX_LENGTH }) }),
      message,
    );
    refresh();
  }

  draw();
}
