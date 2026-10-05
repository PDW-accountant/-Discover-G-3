// ① 모임 조건 입력 + 첫 화면 (개발 A) — FUNC-001, FUNC-004(예시로 해보기 버튼), FUNC-020(내 약속 확인하기 버튼)
// 모임 목적 버튼 3개(회식/회의/오락, 하나만 선택), 도착 희망 일시(현재 이후만). 둘 다 있으면 다음 단계.
// 문구는 lib/data.js의 t()로 읽는다.
// 이번 구현(#19): 목적·도착 일시 입력. '링크로 입력받기'(방 만들기·링크 복사, FUNC-021)는 출발지 입력 화면(participants.js)에 있다.
// 임시저장(FUNC-019, #17): 목적·날짜·시각이 바뀌면 0.5초 뒤 저장, [임시저장]은 바로 저장. 앱을 처음 열 때 저장된 내용이 있으면
//   '이어서 입력할까요?'를 묻고, 이어서 하면 출발지 입력(참여자)까지 되살린다. [내 약속 확인하기]는 내 모임 목록(FUNC-020, #18).
// 예시로 해보기(FUNC-004): data/demo.json 시나리오 버튼을 누르면 그 조건·참여자로 바로 추천 결과 화면을 연다. 시나리오가 없으면 숨긴다.
// 화면 모양은 '모이자 UI 프로토타입2'를 따른다 (예시로 해보기는 프로토타입에 없어 기존 클래스로 아래쪽에 둔다).

import { loadData, t } from '../lib/data.js';
import { loadScenario } from '../lib/demo.js';
import { createShell, el, go } from '../lib/shell.js';
import { clearDraft, hasDraftContent, loadDraft, saveDraft, saveDraftSoon } from '../lib/storage.js';
import { characterNode } from '../lib/characters.js';
import { PURPOSES } from '../config.js';
import { render as renderParticipants } from './participants.js';
import { render as renderResult } from './result.js';
import { render as renderMyMeetings } from './my-meetings.js';

const MINUTES = ['00', '10', '20', '30', '40', '50'];
const EXCLUDED_HOURS = ['01', '02', '03', '04', '05']; // 지하철이 다니지 않는 새벽은 고를 수 없다(#71). 0시(막차 무렵)는 남긴다
export const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).filter((hour) => !EXCLUDED_HOURS.includes(hour));
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
 * 되살린 입력값(임시저장·뒤로 가기)의 시각이 고를 수 없는 새벽(01~05시)이면 기본 시각 19:00으로 바꾼다(#71). 날짜·목적은 그대로.
 * @returns {{form, hourReset: boolean}} hourReset이면 화면에 안내(meeting.error.hour)를 띄운다
 */
export function restoreTime(form) {
  if (!EXCLUDED_HOURS.includes(form.hour)) return { form, hourReset: false };
  return { form: { ...form, hour: DEFAULT_HOUR, min: DEFAULT_MINUTE }, hourReset: true };
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

const pad2 = (n) => String(n).padStart(2, '0');

/** 임시저장 시각 표시: 오늘이면 '19:20', 아니면 '10월 3일 19:20' */
export function formatSavedAt(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? time : `${d.getMonth() + 1}월 ${d.getDate()}일 ${time}`;
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  // 출발지 입력에서 뒤로 돌아오면(#44) params.form으로 목적·도착 날짜·시각을 다시 채운다.
  const { form: initial, hourReset } = restoreTime({ purpose: null, ...defaultArrival(), ...params.form });
  const state = {
    purpose: initial.purpose, dropdownOpen: false,
    date: initial.date, hour: initial.hour, min: initial.min,
    message: hourReset ? t('meeting.error.hour') : '',
  };

  const { screen, foot, toast } = createShell(container, { nav: false });
  const demo = await loadData().then((d) => d.demo).catch(() => null);

  const formValues = () => ({ purpose: state.purpose, date: state.date, hour: state.hour, min: state.min });
  // 값이 바뀌면 안내 문구를 지우고 0.5초 뒤 임시저장한다(#17)
  const changed = () => { state.message = ''; saveDraftSoon({ form: formValues() }); };

  // 앱을 처음 열었을 때만(뒤로 돌아온 경우가 아니면) 저장된 입력이 있는지 본다
  let draft = params.form || params.participants ? null : loadDraft();
  if (!hasDraftContent(draft)) draft = null;
  let carried = params.participants ?? null; // 이어서 입력한 참여자 줄. 다음 화면으로 넘긴다

  /**
   * 이어서 입력: 목적·시각을 채우고, 참여자 입력이 있었으면 출발지 입력 화면까지 연다.
   * 시각이 지났거나 새벽 01~05시라 19:00으로 바꿨으면(#71) 이 화면에서 안내하고 다시 고르게 한다.
   */
  function resumeDraft() {
    const saved = draft;
    draft = null;
    const { form, hourReset } = restoreTime({ purpose: null, ...defaultArrival(), ...saved.form });
    Object.assign(state, form);
    carried = saved.participants?.length ? saved.participants : null;
    const request = buildMeetingRequest(state).request;
    if (carried && request && !hourReset) return goNext();
    if (hourReset) state.message = t('meeting.error.hour');
    else if (carried) currentRequest(); // 약속 시각이 지났으면 '현재 이후 시각을 골라 주세요' 안내
    draw();
  }

  function discardDraft() {
    draft = null;
    clearDraft();
    draw();
  }

  function draftBlock() {
    if (!draft) return null;
    return el('div', { className: 'link-box draft' }, [
      el('p', { className: 'lead', textContent: t('draft.prompt', { time: formatSavedAt(draft.saved_at) }) }),
      el('div', { className: 'row2' }, [
        el('button', { type: 'button', className: 'btn sm', textContent: t('draft.resume'), onclick: resumeDraft }),
        el('button', { type: 'button', className: 'btn ghost sm', textContent: t('draft.discard'), onclick: discardDraft }),
      ]),
    ]);
  }

  /** [임시저장] 버튼: 지금 값을 바로 저장한다 */
  function saveNow() {
    toast(t(saveDraft({ form: formValues() }) ? 'draft.saved' : 'draft.saveFailed'));
  }

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
      const form = formValues();
      saveDraft({ form, request }); // 출발지 입력에서 이어서 할 수 있게 조건을 함께 저장(#17)
      const next = { ...params, request, form, ...(carried ? { participants: carried } : {}) };
      Promise.resolve(go(renderParticipants, container, next, { back: { ...params, form } })).catch(fallback);
    } catch {
      fallback();
    }
  }

  /** 예시로 해보기(FUNC-004): 시나리오의 목적·도착 시각·참여자로 바로 추천 결과 화면을 연다. 뒤로 오면 이 화면. */
  function tryDemo(scenarioId) {
    const scenario = loadScenario(demo, scenarioId);
    if (!scenario) return;
    const form = { purpose: state.purpose, date: state.date, hour: state.hour, min: state.min };
    go(renderResult, container, scenario, { back: { ...params, form } });
  }

  function demoBlock() {
    const scenarios = demo?.scenarios ?? [];
    if (!scenarios.length) return null;
    return el('div', { className: 'block demo' }, [
      el('p', { className: 'opt-label', textContent: t('meeting.demoTitle') }),
      el('div', { className: 'demo-list' }, scenarios.map((s) => el('button', {
        type: 'button', className: 'btn ghost sm',
        textContent: t('meeting.demoOption', { name: s.name, count: s.participants.length }),
        onclick: () => tryDemo(s.id),
      }))),
      el('p', { className: 'hint', textContent: t('meeting.demoHint') }),
    ]);
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

  // 날짜를 먼저 고르고 시·분을 고른다(#69)
  function timeBlock() {
    const today = formatDateInput(new Date());
    return el('div', { className: 'block' }, [
      el('h2', { className: 'q' }, [el('span', { className: 'n', textContent: '2' }), t('meeting.timeQuestion')]),
      el('label', { className: 'opt-label', htmlFor: 'meeting-date', textContent: t('meeting.date') }),
      el('input', {
        type: 'date', id: 'meeting-date', className: 'field', value: state.date, min: today,
        // 칸 어디를 눌러도 달력이 바로 열리게(#69). showPicker가 없거나 막히면 브라우저 기본 동작 그대로
        onclick: (event) => { try { event.target.showPicker?.(); } catch { /* 기본 동작 유지 */ } },
        onchange: (event) => { state.date = event.target.value; changed(); draw(); },
      }),
      el('div', { className: 'time' }, [
        select(t('meeting.hour'), HOURS, state.hour, (v) => { state.hour = v; }),
        el('span', { className: 'u', textContent: t('meeting.hour') }),
        select(t('meeting.minute'), MINUTES, state.min, (v) => { state.min = v; }),
        el('span', { className: 'u', textContent: t('meeting.minute') }),
      ]),
    ]);
  }


  function draw() {
    screen.replaceChildren(
      ...[draftBlock()].filter(Boolean),
      el('div', { className: 'hero' }, [
        el('div', { className: 'eyebrow', textContent: t('meeting.eyebrow') }),
        el('h1', { textContent: t('meeting.title') }),
        el('p', { textContent: t('meeting.lead') }),
        el('div', { className: 'crew-mini' }, [0, 1, 2].map((i) => characterNode(i, 'basic', 40))),
      ]),
      purposeBlock(),
      timeBlock(),
      el('p', { className: 'error', role: 'alert', textContent: state.message }),
      ...[demoBlock()].filter(Boolean),
    );

    const actions = [
      el('button', { type: 'button', className: 'btn', textContent: t('meeting.next'), disabled: !state.purpose, onclick: goNext }),
    ];
    actions.push(el('div', { className: 'row2' }, [
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('meeting.save'), onclick: saveNow }),
      el('button', { type: 'button', className: 'btn ghost sm', textContent: t('meeting.mine'), onclick: () => go(renderMyMeetings, container, {}, { back: { ...params, form: formValues() } }) }),
    ]));
    foot.replaceChildren(...actions);
  }

  draw();
}
