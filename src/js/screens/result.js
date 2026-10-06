// ③ 추천 결과 + 만남 장소 3곳 (개발 A) — FUNC-009, FUNC-010, FUNC-011, FUNC-018(여유)
// 로딩 표시 → 1위 역(크게), 참여자별 시간, '모두 N분 안에', '지하철 기준 예상 시간' 안내. 장소 카드마다 '보기'·'선택'.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 추천 장소(vRec) 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, participants: Participant[], room_id?, … }
//   — 출발지 입력 화면(participants.js)의 '중간 장소 찾기'에서 넘어온다. 빈 닉네임은 이미 'N번'으로 채워져 있다.
// 계산 순서: FUNC-005 후보 역(pickCandidates) → 006 이동시간(travelTimes) → 007 순위(rankStations)
//   → 008 중간 지점 비교(compareWithMidpoint) → 010 장소(placesFor). 2·3위는 보여주지 않는다.
// 참여자 칩을 누르면 그 사람의 경로 카드(#53): 출발역 → 만남 역 요약, 오른쪽 위 '+'로 세부 경로 표를 펼치고 '−'로 접는다.
//   계산은 다시 하지 않고 1위 결과의 travel_times[참여자 id](minutes·transfers·steps)를 쓴다. 표시는 lib/route-steps.js(개인 경로 화면과 같은 모양).
// '이 장소로 약속 확정하기' → confirm.js render(container, { request, selected_result, place, participants, room_id })
// 목적이 '기타'(#88)면 장소 목록을 그리지 않고 '이 역으로 약속 확정하기'가 바로 눌린다(place: null).
// '지금 출발 기준'이라는 표현은 쓰지 않는다(외부 조회가 없어 시점 개념이 없음).

import { loadData, t } from '../lib/data.js';
import { lineBadge, rareServiceNotices } from '../lib/stations.js';
import { travelTimes } from '../lib/transit.js';
import { compareWithMidpoint, pickCandidates, rankStations } from '../lib/recommend.js';
import { placeLink, placesFor } from '../lib/places.js';
import { createShell, el, go } from '../lib/shell.js';
import { expressLinesOf, resolveSteps, routeSummary, stepList } from '../lib/route-steps.js';
import { characterNode } from '../lib/characters.js';
import { render as renderConfirm } from './confirm.js';

const SLOW_MS = 10000; // 10초가 넘으면 대기 안내와 '다시 시도' (FUNC-009 예외)

const pad = (n) => String(n).padStart(2, '0');

/** 약속 시각 'HH:MM'(브라우저 시간대). 만남 역에서 출발하는 사람은 이 시각 정각에 출발한다고 표시한다(#53). */
export function arrivalClock(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** '모두 N분 안에'의 N: 최장 시간을 5분 단위로 올린다. */
export function roundUpTo5(minutes) {
  return Math.ceil(minutes / 5) * 5;
}

/**
 * FUNC-008 비교 문구의 종류. 단축 분이 있으면 'compare', 중간 지점이 곧 1위 역이면 'compareSame',
 * 단축 분이 0인데 중간 지점이 다른 역이면 null(문구를 숨긴다 — '중간 지점이 이미 가장 공평해요'는 1위가 다른 역일 때 틀린 말).
 * @param {{midpoint_station, saved_minutes}|null} comparison compareWithMidpoint 결과
 * @param {Station} station 1위 역
 * @returns {'compare'|'compareSame'|null}
 */
export function compareKind(comparison, station) {
  if (!comparison) return null;
  if (comparison.saved_minutes > 0) return 'compare';
  return comparison.midpoint_station.id === station.id ? 'compareSame' : null;
}

/**
 * FUNC-005 → 006 → 007 → 008 → 010 계산을 한 번에 한다(화면과 분리해 테스트한다).
 * @param {{stations, transitGraph, candidates, places}} data loadData() 결과
 * @param {{purpose}} request
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 * @returns {{top, comparison, places, stationsById, expressLines}|{error:'noCandidates'|'failed'}}
 *   역 데이터에 없는 출발역이 섞여 시간을 구할 수 없으면(NaN) 'failed' — 화면에 'NaN분'을 보여주지 않는다
 */
export function computeResult(data, request, participants) {
  const stationsById = Object.fromEntries((data.stations ?? []).map((s) => [s.id, s]));
  const { candidates, midpoint } = pickCandidates(request.purpose, participants, stationsById, data.candidates);
  if (!candidates.length) return { error: 'noCandidates' };
  const times = travelTimes(data.transitGraph ?? null, participants, candidates, stationsById);
  if (Object.values(times).some((byStation) => Object.values(byStation).some((t) => !Number.isFinite(t.minutes)))) return { error: 'failed' };
  const results = rankStations(candidates, times);
  const top = results[0];
  return {
    top,
    comparison: compareWithMidpoint(results, midpoint),
    places: placesFor(data.places, top.station.id, request.purpose),
    stationsById,
    expressLines: expressLinesOf(data.transitGraph),
  };
}

/**
 * 경로 카드(#53)에 쓸 한 사람의 경로. 1위 결과의 이동시간을 화면용으로 바꾼다(다시 계산하지 않음).
 * @param {{origin_station_id}} participant
 * @param {{minutes, transfers, steps, is_estimated}} time top.travel_times[참여자 id]
 * @param {Station} destination 만남 역(1위)
 * @returns {{from, to, minutes, transfers: number|null, steps, is_estimated, same_station, has_detail}}
 */
export function routeCardInfo(participant, time, stationsById, destination, expressLines = new Set()) {
  const from = stationsById[participant.origin_station_id] ?? { id: participant.origin_station_id, name: String(participant.origin_station_id), lines: [] };
  const sameStation = from.id === destination.id;
  const estimated = !sameStation && time.is_estimated === true;
  const steps = sameStation || estimated ? [] : resolveSteps(time.steps, stationsById, expressLines);
  return {
    from,
    to: destination,
    minutes: time.minutes,
    transfers: estimated ? null : (time.transfers ?? 0), // 예상 시간은 환승을 알 수 없다
    steps,
    is_estimated: estimated,
    same_station: sameStation,
    has_detail: steps.length > 0, // 세부 경로 표('+')를 보여줄 수 있는지
  };
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

/** 참여자 한 명의 칩(버튼): 캐릭터 + '감자 24분 · 환승 1회' (+ 예상). 누르면 그 사람의 경로 카드(#53). */
function personChip(participant, index, time, { on, onclick }) {
  const parts = [
    t('result.person', { name: participant.nickname, minutes: time.minutes }),
    time.transfers ? t('result.transfers', { count: time.transfers }) : t('result.direct'),
    ...(time.is_estimated ? [t('result.estimatedMark')] : []),
  ];
  return el('button', { type: 'button', className: on ? 'on' : '', ariaPressed: String(on), onclick }, [characterNode(index, 'basic', 20), parts.join(' · ')]);
}

/** 화면을 그린다. @param {HTMLElement} container */
export async function render(container, params = {}) {
  const { request, participants = [] } = params;
  const { screen, foot } = createShell(container);

  function showMessage(text, { retry = false } = {}) {
    screen.replaceChildren(
      el('div', { className: 'done-wrap' }, [
        characterNode(0, 'basic', 64),
        el('p', { className: 'lead', role: 'status', textContent: text }),
      ]),
    );
    foot.replaceChildren(...(retry ? [el('button', {
      type: 'button', className: 'btn', textContent: t('result.retry'), onclick: () => render(container, params),
    })] : []));
  }

  // 로딩 표시를 먼저 그린 뒤 계산한다(계산은 브라우저에서 수십 ms, 데이터 읽기가 느릴 때를 대비해 10초 안내).
  showMessage(t('result.loading'));
  let finished = false;
  const slowTimer = setTimeout(() => { if (!finished && screen.isConnected) showMessage(t('result.slow'), { retry: true }); }, SLOW_MS);

  let outcome;
  try {
    const data = await loadData();
    await new Promise((resolve) => setTimeout(resolve, 0)); // 로딩 문구가 먼저 그려지게 한 박자 쉰다
    outcome = computeResult(data, request, participants);
  } catch (e) {
    console.warn('추천 결과를 만들지 못했습니다', e);
    outcome = { error: 'failed' };
  }
  finished = true;
  clearTimeout(slowTimer);
  if (!screen.isConnected) return; // 기다리는 동안 다른 화면으로 넘어갔다
  if (outcome.error === 'noCandidates') return showMessage(t('result.noCandidates'));
  if (outcome.error) return showMessage(t('result.failed'), { retry: true });

  const { top, comparison, places, stationsById, expressLines } = outcome;
  const station = top.station;
  const stationOnly = request.purpose === '기타'; // 장소 추천 없이 역만 확정(#88)
  let selected = null;      // 고른 장소
  let routeOf = null;       // 경로 카드를 보고 있는 참여자 id (#53)
  let detailOpen = false;   // 세부 경로 표를 펼쳤는지. 다른 사람으로 바꿔도 유지한다

  const kind = compareKind(comparison, station);
  const compareText = kind === 'compare'
    ? t('result.compare', { station: comparison.midpoint_station.name, minutes: comparison.saved_minutes })
    : kind === 'compareSame' ? t('result.compareSame') : '';

  const who = el('div', { className: 'who' });
  const routeHint = el('p', { className: 'rec-meta', textContent: t('result.routeHint') });
  const routeBox = el('div');

  /** 참여자 칩: 누르면 그 사람의 경로 카드, 같은 칩을 다시 누르면 닫는다 */
  function drawWho() {
    who.replaceChildren(...participants.map((p, i) => personChip(p, i, top.travel_times[p.participant_id], {
      on: routeOf === p.participant_id,
      onclick: () => { routeOf = routeOf === p.participant_id ? null : p.participant_id; drawWho(); drawRouteCard(); },
    })));
    routeHint.hidden = routeOf !== null;
  }

  /** 경로 카드: 머리(캐릭터·'○○님의 경로'·오른쪽 위 '+'/'−') → 요약 줄 → (펼치면) 세부 경로 표 */
  function drawRouteCard() {
    const index = participants.findIndex((p) => p.participant_id === routeOf);
    if (index < 0) return routeBox.replaceChildren();
    const person = participants[index];
    const info = routeCardInfo(person, top.travel_times[person.participant_id], stationsById, station, expressLines);
    const open = detailOpen && info.has_detail;
    const toggle = info.has_detail ? [el('button', {
      type: 'button', className: 'tg', textContent: open ? '−' : '+',
      ariaExpanded: String(open), ariaLabel: t(open ? 'result.collapse' : 'result.expand'),
      onclick: () => { detailOpen = !detailOpen; drawRouteCard(); },
    })] : [];
    const head = el('div', { className: 'acc-h' }, [
      el('span', { className: 'nm' }, [characterNode(index, 'basic', 28), t('result.routeTitle', { name: person.nickname })]),
      ...toggle,
    ]);
    let body;
    // 만남 역에서 출발: 0분, 약속 시각 정각에 출발 (여유 시간을 빼지 않는다)
    if (info.same_station) body = [el('div', { className: 'route' }, [t('result.routeSame', { time: arrivalClock(request.arrival_time) })])];
    else if (info.is_estimated) body = [routeSummary(info), el('p', { className: 'notice', textContent: t('result.routeEstimated') })];
    else body = [routeSummary(info), el('div', { className: 'acc-b' }, [stepList(info.steps, { withTransfers: true })])];
    routeBox.replaceChildren(el('div', { className: open ? 'acc route-card open' : 'acc route-card' }, [head, ...body]));
  }

  const rec = el('div', { className: 'rec' }, [
    el('div', { className: 'eyebrow', textContent: t('result.eyebrow') }),
    el('div', { className: 'st' }, [t('join.stationName', { name: station.name }), ...lineBadges(station.lines)]),
    who,
    routeHint,
    el('p', { className: 'rec-sum', textContent: t('result.summary', { maxMinutes: roundUpTo5(top.max_time) }) }),
    el('p', { className: 'rec-meta', textContent: t('result.stats', { avg: Math.round(top.avg_time), max: top.max_time }) }),
    ...(compareText ? [el('p', { className: 'rec-meta', textContent: compareText })] : []),
  ]);

  const list = el('div', { className: 'list' });
  function drawPlaces() {
    if (stationOnly) { // 기타: 장소 목록 없이 안내 한 줄, 확정 버튼은 처음부터 켜진다
      list.replaceChildren(el('p', { className: 'hint', textContent: t('result.stationOnly') }));
      foot.replaceChildren(el('button', {
        type: 'button', className: 'btn', textContent: t('result.confirmStation'),
        onclick: () => go(renderConfirm, container, { request, selected_result: top, place: null, participants, room_id: params.room_id }),
      }));
      return;
    }
    const purposeLabel = t(`meeting.purpose.${request.purpose}`);
    const rows = places.length
      ? places.map((place) => {
        const on = selected === place;
        return el('div', { className: on ? 'place sel' : 'place' }, [
          el('div', {}, [
            el('b', { textContent: place.name }),
            el('em', { textContent: [place.category, place.reason].filter(Boolean).join(' · ') }),
          ]),
          el('div', { className: 'pl-btns' }, [
            el('a', { className: 'mini', href: placeLink(place), target: '_blank', rel: 'noopener', textContent: t('result.view') }),
            el('button', {
              type: 'button', className: on ? 'mini on' : 'mini', ariaPressed: String(on),
              textContent: t(on ? 'result.selected' : 'result.select'),
              onclick: () => { selected = place; drawPlaces(); },
            }),
          ]),
        ]);
      })
      // 장소가 0곳이면 안내와 카카오맵 검색 링크(역 이름 + 목적) (FUNC-010 예외)
      : [el('div', { className: 'place' }, [
        el('div', {}, [el('b', { textContent: t('place.empty') })]),
        el('div', { className: 'pl-btns' }, [el('a', {
          className: 'mini', target: '_blank', rel: 'noopener', textContent: t('result.searchKakao'),
          href: placeLink({ name: `${t('join.stationName', { name: station.name })} ${request.purpose}` }),
        })]),
      ])];
    list.replaceChildren(
      el('div', { className: 'list-h' }, [t('result.placesTitle'), el('small', { textContent: purposeLabel })]),
      ...rows,
    );
    foot.replaceChildren(el('button', {
      type: 'button', className: 'btn', disabled: !selected,
      textContent: t(selected ? 'result.confirm' : 'result.pickPlace'),
      onclick: () => go(renderConfirm, container, {
        request, selected_result: top, place: selected, participants, room_id: params.room_id,
      }),
    }));
  }

  screen.replaceChildren(
    el('p', { className: 'lead', textContent: t('result.lead') }),
    rec,
    routeBox,
    list,
    el('p', { className: 'hint', textContent: t('result.timeBasis') }),
    ...rareServiceNotices([...participants.map((p) => stationsById[p.origin_station_id]), station])
      .map((text) => el('p', { className: 'notice', textContent: text })),
    ...(top.is_estimated ? [el('p', { className: 'hint', textContent: t('result.partialEstimate') })] : []),
    ...(places.length && !stationOnly ? [el('p', { className: 'hint', textContent: t('result.viewHint') })] : []),
  );
  drawWho();
  drawPlaces();
}
