// ③ 추천 결과 + 만남 장소 3곳 (개발 A) — FUNC-009, FUNC-010, FUNC-011, FUNC-018(여유)
// 로딩 표시 → 1위 역(크게), 참여자별 시간, '모두 N분 안에', '지하철 기준 예상 시간' 안내. 장소 카드마다 '보기'·'선택'.
// 문구는 lib/data.js의 t()로 읽는다. 화면 모양은 '모이자 UI 프로토타입2'의 추천 장소(vRec) 화면을 따른다.
// params: { request: MeetingRequest{purpose, arrival_time}, participants: Participant[], room_id?, … }
//   — 출발지 입력 화면(participants.js)의 '중간 장소 찾기'에서 넘어온다. 빈 닉네임은 이미 'N번'으로 채워져 있다.
// 계산 순서: FUNC-005 후보 역(pickCandidates) → 006 이동시간(travelTimes) → 007 순위(rankStations)
//   → 008 중간 지점 비교(compareWithMidpoint) → 010 장소(placesFor). 2·3위는 보여주지 않는다.
// '이 장소로 약속 확정하기' → confirm.js render(container, { request, selected_result, place, participants, room_id })
// '지금 출발 기준'이라는 표현은 쓰지 않는다(외부 조회가 없어 시점 개념이 없음).

import { loadData, t } from '../lib/data.js';
import { lineBadge, rareServiceNotices } from '../lib/stations.js';
import { travelTimes } from '../lib/transit.js';
import { compareWithMidpoint, pickCandidates, rankStations } from '../lib/recommend.js';
import { placeLink, placesFor } from '../lib/places.js';
import { createShell, el, go } from '../lib/shell.js';
import { characterNode } from '../lib/characters.js';
import { render as renderConfirm } from './confirm.js';

const SLOW_MS = 10000; // 10초가 넘으면 대기 안내와 '다시 시도' (FUNC-009 예외)

/** '모두 N분 안에'의 N: 최장 시간을 5분 단위로 올린다. */
export function roundUpTo5(minutes) {
  return Math.ceil(minutes / 5) * 5;
}

/**
 * FUNC-005 → 006 → 007 → 008 → 010 계산을 한 번에 한다(화면과 분리해 테스트한다).
 * @param {{stations, transitGraph, candidates, places}} data loadData() 결과
 * @param {{purpose}} request
 * @param {Array<{participant_id, nickname, origin_station_id}>} participants
 * @returns {{top, comparison, places, stationsById}|{error:'noCandidates'}}
 */
export function computeResult(data, request, participants) {
  const stationsById = Object.fromEntries((data.stations ?? []).map((s) => [s.id, s]));
  const { candidates, midpoint } = pickCandidates(request.purpose, participants, stationsById, data.candidates);
  if (!candidates.length) return { error: 'noCandidates' };
  const times = travelTimes(data.transitGraph ?? null, participants, candidates, stationsById);
  const results = rankStations(candidates, times);
  const top = results[0];
  return {
    top,
    comparison: compareWithMidpoint(results, midpoint),
    places: placesFor(data.places, top.station.id, request.purpose),
    stationsById,
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

/** 참여자 한 명의 칩: 캐릭터 + '감자 24분 · 환승 1회' (+ 예상) */
function personChip(participant, index, time) {
  const parts = [
    t('result.person', { name: participant.nickname, minutes: time.minutes }),
    time.transfers ? t('result.transfers', { count: time.transfers }) : t('result.direct'),
    ...(time.is_estimated ? [t('result.estimatedMark')] : []),
  ];
  return el('span', {}, [characterNode(index, 'basic', 20), parts.join(' · ')]);
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

  const { top, comparison, places, stationsById } = outcome;
  const station = top.station;
  let selected = null; // 고른 장소

  const compareText = comparison && (comparison.saved_minutes > 0
    ? t('result.compare', { station: comparison.midpoint_station.name, minutes: comparison.saved_minutes })
    : t('result.compareSame'));

  const rec = el('div', { className: 'rec' }, [
    el('div', { className: 'eyebrow', textContent: t('result.eyebrow') }),
    el('div', { className: 'st' }, [t('join.stationName', { name: station.name }), ...lineBadges(station.lines)]),
    el('div', { className: 'who' }, participants.map((p, i) => personChip(p, i, top.travel_times[p.participant_id]))),
    el('p', { className: 'rec-sum', textContent: t('result.summary', { maxMinutes: roundUpTo5(top.max_time) }) }),
    el('p', { className: 'rec-meta', textContent: t('result.stats', { avg: Math.round(top.avg_time), max: top.max_time }) }),
    ...(compareText ? [el('p', { className: 'rec-meta', textContent: compareText })] : []),
  ]);

  const list = el('div', { className: 'list' });
  function drawPlaces() {
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
    list,
    el('p', { className: 'hint', textContent: t('result.timeBasis') }),
    ...rareServiceNotices([...participants.map((p) => stationsById[p.origin_station_id]), station])
      .map((text) => el('p', { className: 'notice', textContent: text })),
    ...(top.is_estimated ? [el('p', { className: 'hint', textContent: t('result.partialEstimate') })] : []),
    ...(places.length ? [el('p', { className: 'hint', textContent: t('result.viewHint') })] : []),
  );
  drawPlaces();
}
