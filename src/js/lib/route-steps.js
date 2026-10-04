// 경로 구간 표시 (공용) — #53
// 추천 결과(result.js)의 경로 카드와 개인 경로(route.js)가 같은 모양으로 그리도록 한곳에 둔다.
// 구간(step) 화면용 형태: { line, train: 'express'|'local'|null, from: Station, to: Station, minutes }
// 문구는 lib/data.js의 t()로 읽는다.

import { t } from './data.js';
import { lineBadge } from './stations.js';
import { el } from './shell.js';

const ARROW_SVG = '<svg viewBox="0 0 46 10" aria-hidden="true"><path d="M1 5h42M38 1l5 4-5 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** 급행 계통이 있는 호선 목록(그래프 routes 기준). */
export function expressLinesOf(graph) {
  return new Set((graph?.routes ?? []).filter((r) => r.express).map((r) => r.line));
}

/** 급행이 다니는 노선(그래프 routes에 급행 계통이 있는 호선)이면 구간에 'express'/'local'. 급행이 없는 노선은 null(표시 안 함). */
export function trainKind(step, expressLines) {
  if (step.express) return 'express';
  return expressLines.has(step.line) ? 'local' : null;
}

/**
 * transit 결과의 구간(from·to는 역 id)을 화면용 구간으로 바꾼다.
 * @param {Array<{line, express, from, to, minutes}>} steps
 * @param {Object<string, Station>} stationsById
 * @param {Set<string>} expressLines expressLinesOf(graph)
 */
export function resolveSteps(steps, stationsById, expressLines) {
  const station = (id) => stationsById[id] ?? { id: String(id ?? ''), name: String(id ?? ''), lines: [] };
  return (steps ?? []).map((s) => ({
    line: s.line, train: trainKind(s, expressLines), from: station(s.from), to: station(s.to), minutes: s.minutes,
  }));
}

/** 호선 동그라미 */
export function badgeNode(line) {
  const { label, background, color } = lineBadge(line);
  return el('span', {
    className: label.length > 1 ? 'badge two' : 'badge', textContent: label, title: `${line}`,
    style: `background:${background};color:${color}`,
  });
}

/** 호선 동그라미 옆 '급행'/'일반' 꼬리표. 급행이 없는 노선이면 없음. */
export function trainNodes(train) {
  return train ? [el('span', { className: `train ${train}`, textContent: t(`route.${train}`) })] : [];
}

function stationLabel(station) {
  return t('confirm.station', { name: station.name });
}

/**
 * 요약 줄: '연신내역 (3) ──16분──> 종로3가역' + '총 16분 · 환승 없음' (+ 예상이면 강조).
 * @param {{from: Station, to: Station, minutes: number, transfers: number|null, steps: Array, is_estimated: boolean}} info
 */
export function routeSummary(info) {
  const arrow = el('span', { className: 'arrow', textContent: t('route.minutes', { minutes: info.minutes }) });
  arrow.insertAdjacentHTML('beforeend', ARROW_SVG);
  const meta = [t('route.total', { minutes: info.minutes })];
  if (info.transfers !== null) meta.push(info.transfers ? t('route.transfers', { count: info.transfers }) : t('route.noTransfer'));
  return el('div', { className: 'route' }, [
    stationLabel(info.from), ...(info.steps[0] ? [badgeNode(info.steps[0].line), ...trainNodes(info.steps[0].train)] : []), arrow, stationLabel(info.to),
    el('span', { className: 'meta', textContent: meta.join(' · ') }),
    ...(info.is_estimated ? [el('span', { className: 'est', textContent: t('route.estimated') })] : []),
  ]);
}

/**
 * 구간 목록 <ol class="steps">. 구간이 없으면 null.
 * @param {Array} steps 화면용 구간(resolveSteps)
 * @param {{withTransfers?: boolean}} options withTransfers: 호선이 바뀌는 곳에 '○○역에서 환승' 줄을 넣는다(추천 결과 화면)
 */
export function stepList(steps, { withTransfers = false } = {}) {
  if (!steps?.length) return null;
  const rows = [];
  steps.forEach((s, i) => {
    const prev = steps[i - 1];
    if (withTransfers && prev && prev.line !== s.line) {
      rows.push(el('li', { className: 'transfer' }, [el('span', { className: 'seg', textContent: t('route.transferAt', { station: s.from.name }) })]));
    }
    rows.push(el('li', {}, [
      badgeNode(s.line),
      ...trainNodes(s.train),
      el('span', { className: 'seg', textContent: t('route.step', { from: s.from.name, to: s.to.name }) }),
      el('span', { className: 'min', textContent: t('route.minutes', { minutes: s.minutes }) }),
    ]));
  });
  return el('ol', { className: 'steps' }, rows);
}
