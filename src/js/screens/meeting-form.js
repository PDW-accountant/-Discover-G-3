// ① 모임 조건 입력 + 첫 화면 (개발 A) — FUNC-001, FUNC-004(예시로 해보기 버튼), FUNC-020(내 약속 확인하기 버튼), FUNC-021(링크로 입력받기 버튼)
// 모임 목적 버튼 3개(회식/회의/오락, 하나만 선택), 도착 희망 일시(현재 이후만). 둘 다 있으면 다음 단계.
// 문구는 lib/data.js의 t()로 읽는다.
// 이번 구현(#19): 목적·도착 일시 입력, '링크로 입력받기'(방 만들기·링크 복사). 저장소가 없으면 그 버튼은 숨긴다(NFR-011).
// 임시저장·내 약속 확인하기 버튼은 모양만 있고 누르면 준비 중 안내가 뜬다. 각 기능은 FUNC-019·020, 예시로 해보기는 FUNC-004에서 붙인다.
// 화면 모양은 '모이자 UI 프로토타입2'를 따른다.

import { t } from '../lib/data.js';
import { createRoom, getStatus } from '../lib/api-client.js';
import { setHostToken } from '../lib/storage.js';
import { createShell, el } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { PURPOSES } from '../config.js';
import { render as renderParticipants } from './participants.js';

const MINUTES = ['00', '10', '20', '30', '40', '50'];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const DEFAULT_HOUR = '19';
const DEFAULT_MINUTE = '00';

const pad = (n) => String(n).padStart(2, '0');

/** 날짜 입력칸(yyyy-mm-dd)에 넣는 값. 브라우저 시간대 기준. */
export function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 처음 보여줄 도착 시각: 오늘 19:00, 이미 지났으면 내일 19:00. */
export function defaultArrival(now = new Date()) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(DEFAULT_HOUR), Number(DEFAULT_MINUTE));
  if (day <= now) day.setDate(day.getDate() + 1);
  return { date: formatDateInput(day), hour: DEFAULT_HOUR, min: DEFAULT_MINUTE };
}

/**
 * 입력값을 MeetingRequest로 바꾼다. 도착 일시는 현재 이후만 받는다.
 * @param {{purpose, date, hour, min}} values 날짜는 yyyy-mm-dd
 * @returns {{request:{purpose, arrival_time}}|{error:'purpose'|'date'|'past'}}
 */
export function buildMeetingRequest({ purpose, date, hour, min }, now = new Date()) {
  if (!PURPOSES.includes(purpose)) return { error: 'purpose' };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  if (!match || !HOURS.includes(hour) || !MINUTES.includes(min)) return { error: 'date' };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const arrival = new Date(year, month - 1, day, Number(hour), Number(min));
  if (arrival.getMonth() !== month - 1 || arrival.getDate() !== day) return { error: 'date' }; // 2월 30일 같은 날짜
  if (arrival <= now) return { error: 'past' };
  return { request: { purpose, arrival_time: arrival.toISOString() } };
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const initial = defaultArrival();
  const state = {
    purpose: null, dropdownOpen: false,
    date: initial.date, hour: initial.hour, min: initial.min,
    room: null,        // 방 만들기에 성공하면 { room_id, join_url, host_token }
    busy: false, message: '', copyNote: '',
    canInvite: false,  // 저장소가 연결되어 있을 때만 '링크로 입력받기'
  };

  const { screen, foot, toast } = createShell(container, { nav: false });

  // 조건을 바꾸면 이미 만든 링크의 모임 조건과 달라지므로 링크를 지운다.
  const changed = () => { state.room = null; state.message = ''; state.copyNote = ''; };

  function currentRequest() {
    const result = buildMeetingRequest(state);
    state.message = result.error ? t(`meeting.error.${result.error}`) : '';
    return result.request ?? null;
  }

  /** 출발지 입력 화면을 연다. 그 화면이 아직 없으면 안내 문구만 띄운다. */
  function goNext() {
    const request = currentRequest();
    if (!request) return draw();
    const fallback = () => toast(t('meeting.nextNotReady'));
    try {
      Promise.resolve(renderParticipants(container, {
        ...params, request, room_id: state.room?.room_id, join_url: state.room?.join_url,
      })).catch(fallback);
    } catch {
      fallback();
    }
  }

  async function invite() {
    const request = currentRequest();
    if (!request) return draw();
    state.busy = true;
    draw();
    const room = await createRoom(request);
    state.busy = false;
    if (room.error) {
      state.message = t('meeting.inviteFailed');
    } else {
      setHostToken(room.room_id, room.host_token);
      state.room = room;
    }
    draw();
  }

  async function copyLink() {
    const copied = await copyToClipboard(state.room.join_url);
    state.copyNote = t(copied ? 'meeting.copied' : 'meeting.copyFailed');
    draw();
    if (!copied) screen.querySelector('.link-box input')?.select(); // 복사 권한이 없으면 링크를 선택해 직접 복사하게 한다
  }

  function purposeBlock() {
    const label = state.purpose ? t(`meeting.purpose.${state.purpose}`) : t('meeting.purposePlaceholder');
    const list = el('div', { className: 'dd-list', hidden: !state.dropdownOpen }, PURPOSES.map((purpose) => el('button', {
      type: 'button', className: 'dd-opt',
      onclick: () => { state.purpose = purpose; state.dropdownOpen = false; changed(); draw(); },
    }, [
      el('span', { textContent: t(`meeting.purpose.${purpose}`) }),
      el('span', { className: 'em', textContent: t(`meeting.purposeHint.${purpose}`) }),
    ])));
    return el('div', { className: 'block' }, [
      el('h2', { className: 'q' }, [el('span', { className: 'n', textContent: '1' }), t('meeting.purposeQuestion')]),
      el('div', { className: state.dropdownOpen ? 'dd open' : 'dd' }, [
        el('button', {
          type: 'button', className: 'dd-head', ariaExpanded: String(state.dropdownOpen),
          onclick: () => { state.dropdownOpen = !state.dropdownOpen; draw(); },
        }, [el('span', { className: state.purpose ? '' : 'ph', textContent: label }), el('span', { className: 'chev', ariaHidden: 'true' })]),
        list,
      ]),
    ]);
  }

  function select(label, options, value, onChange) {
    return el('select', {
      ariaLabel: label,
      onchange: (event) => { onChange(event.target.value); changed(); draw(); },
    }, options.map((option) => el('option', { value: option, textContent: option, selected: option === value })));
  }

  function timeBlock() {
    const today = formatDateInput(new Date());
    return el('div', { className: 'block' }, [
      el('h2', { className: 'q' }, [el('span', { className: 'n', textContent: '2' }), t('meeting.timeQuestion')]),
      el('div', { className: 'time' }, [
        select(t('meeting.hour'), HOURS, state.hour, (v) => { state.hour = v; }),
        el('span', { className: 'u', textContent: t('meeting.hour') }),
        select(t('meeting.minute'), MINUTES, state.min, (v) => { state.min = v; }),
        el('span', { className: 'u', textContent: t('meeting.minute') }),
      ]),
      el('label', { className: 'opt-label', htmlFor: 'meeting-date', textContent: t('meeting.date') }),
      el('input', {
        type: 'date', id: 'meeting-date', className: 'field', value: state.date, min: today,
        onchange: (event) => { state.date = event.target.value; changed(); draw(); },
      }),
    ]);
  }

  function linkBlock() {
    const input = el('input', { type: 'text', readOnly: true, value: state.room.join_url, ariaLabel: t('meeting.linkReady') });
    return el('div', { className: 'link-box' }, [
      el('p', { className: 'lead', textContent: t('meeting.linkReady') }),
      input,
      el('button', { type: 'button', className: 'btn ghost', textContent: t('meeting.copyLink'), onclick: copyLink }),
      el('p', { className: 'hint', role: 'status', textContent: state.copyNote }),
    ]);
  }

  function draw() {
    screen.replaceChildren(
      el('div', { className: 'hero' }, [
        el('div', { className: 'eyebrow', textContent: t('meeting.eyebrow') }),
        el('h1', { textContent: t('meeting.title') }),
        el('p', { textContent: t('meeting.lead') }),
        el('div', { className: 'crew-mini' }, [0, 1, 2].map((i) => characterNode(i, 'basic', 40))),
      ]),
      purposeBlock(),
      timeBlock(),
      el('p', { className: 'error', role: 'alert', textContent: state.message }),
      ...(state.room ? [linkBlock()] : []),
    );

    const notReady = !state.purpose || state.busy;
    const actions = [
      el('button', { type: 'button', className: 'btn', textContent: t('meeting.next'), disabled: notReady, onclick: goNext }),
    ];
    if (state.canInvite && !state.room) {
      actions.push(el('button', {
        type: 'button', className: 'btn ghost', disabled: notReady, onclick: invite,
        textContent: state.busy ? t('meeting.inviting') : t('meeting.invite'),
      }));
    }
    actions.push(el('div', { className: 'row2' }, [
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('meeting.save'), onclick: () => toast(t('meeting.saveSoon')) }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('meeting.mine'), onclick: () => toast(t('meeting.mineSoon')) }),
    ]));
    foot.replaceChildren(...actions);
  }

  draw();
  // 저장소 연결 여부는 화면을 먼저 보여준 뒤 확인한다. 서버가 없으면 버튼 없이 총무 일괄 입력만 쓴다.
  const status = await getStatus();
  if (status.rooms) { state.canInvite = true; draw(); }
}
