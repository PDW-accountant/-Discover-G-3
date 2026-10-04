// 경로 구간 표시 (공용) — #53
// 추천 결과(result.js)의 경로 카드와 개인 경로(route.js)가 같은 모양으로 그리도록 한곳에 둔다.
// 구간(step) 화면용 형태: { line, train: 'express'|'local'|null, from: Station, to: Station, minutes, change? }
//   change: 그 구간을 타기 전 갈아타기 { type: 'transfer'|'swap', walk: 도보 분, wait: 대기 분 } (transit.js, 두 번째 구간부터)
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
    ...(s.change ? { change: s.change } : {}),
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
 * 구간 사이 갈아타기 줄의 문구. change가 없으면(예전 계산 결과) 호선이 바뀔 때만 '○○역에서 환승'.
 * @returns {string|null}
 */
export function changeText(step, prev) {
  const station = step.from.name;
  const c = step.change;
  if (c?.type === 'swap') return t('route.swapAt', { station, train: t(`route.${step.train ?? 'local'}`), wait: c.wait });
  if (c) return c.walk > 0 ? t('route.transferWalk', { station, walk: c.walk, wait: c.wait }) : t('route.transferWait', { station, wait: c.wait });
  return prev && prev.line !== step.line ? t('route.transferAt', { station }) : null;
}

/**
 * 구간 목록 <ol class="steps">. 구간이 없으면 null.
 * @param {Array} steps 화면용 구간(resolveSteps)
 * @param {{withTransfers?: boolean}} options withTransfers: 구간 사이에 '○○역에서 환승 · 도보 n분 + 대기 3분' 줄을 넣는다(추천 결과 화면)
 */
export function stepList(steps, { withTransfers = false } = {}) {
  if (!steps?.length) return null;
  const rows = [];
  steps.forEach((s, i) => {
    const text = withTransfers && i > 0 ? changeText(s, steps[i - 1]) : null;
    if (text) rows.push(el('li', { className: 'transfer' }, [el('span', { className: 'seg', textContent: text })]));
    rows.push(el('li', {}, [
      badgeNode(s.line),
      ...trainNodes(s.train),
      el('span', { className: 'seg', textContent: t('route.step', { from: s.from.name, to: s.to.name }) }),
      el('span', { className: 'min', textContent: t('route.minutes', { minutes: s.minutes }) }),
    ]));
  });
  return el('ol', { className: 'steps' }, rows);
}
