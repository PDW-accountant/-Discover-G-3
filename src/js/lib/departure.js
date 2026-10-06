// 권장 출발 시각 (개발 C) — FUNC-025
// 요약 문구는 data/copy.json의 departure.* 키로 만든다.

import { t } from './data.js';

export const BUFFER_MINUTES = 10; // 여유 시간 (10/3 확정)

const MINUTE_MS = 60 * 1000;

/** 호선 이름: 숫자면 'N호선', 이름 노선은 '…선'('공항철도'처럼 이미 끝나면 그대로). */
export function lineName(line) {
  const text = String(line ?? '').trim();
  if (/^\d+$/.test(text)) return t('departure.lineNumber', { line: text });
  if (!text || /(선|철도)$/.test(text)) return text;
  return t('departure.lineName', { line: text });
}

/** 환승 횟수: 이어지는 구간 사이에 호선이 바뀐 횟수. */
export function countTransfers(steps = []) {
  return steps.reduce((count, step, i) => (i > 0 && step?.line !== steps[i - 1]?.line ? count + 1 : count), 0);
}

/** 이동 방법 요약: '2호선 승차 · 환승 1회'. 구간이 없으면 빈 문자열(예상 시간일 때). */
export function routeSummary(steps = []) {
  const list = Array.isArray(steps) ? steps.filter(Boolean) : [];
  if (!list.length) return '';
  const transfers = countTransfers(list);
  const line = lineName(list[0].line);
  return transfers
    ? t('departure.summary', { line, count: transfers })
    : t('departure.summaryDirect', { line });
}

/**
 * 권장 출발 시각 = 도착 희망 시각 − (소요시간 + 역 → 장소 도보) − 여유 10분 (분 단위 내림).
 * 예: 18:00 도착 · 24분 → 17:26, 도보 6분까지 → 17:20 (#86: 만남 역이 아니라 장소 도착 기준)
 * @param {Date} arrivalTime
 * @param {number} minutes
 * @param {Array} steps 경로 단계 (이동 방법 요약용: 첫 노선, 환승 횟수)
 * @param {Date} [now]
 * @param {number|null} [walkMinutes] 만남 역 → 장소 도보 분(places.json walk_minutes). 없으면 역 도착 기준
 * @returns {{depart_at: Date, summary: string, is_past: boolean}} is_past면 화면에 '지금 출발하세요'
 */
export function departureAdvice(arrivalTime, minutes, steps = [], now = new Date(), walkMinutes = 0) {
  const arrival = new Date(arrivalTime);
  if (Number.isNaN(arrival.getTime())) throw new Error('도착 희망 시각이 올바르지 않습니다');
  const travel = Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  const walk = Number.isFinite(walkMinutes) && walkMinutes > 0 ? walkMinutes : 0;
  // 밀리초로 빼므로 자정·날짜가 바뀌어도 그대로 맞다.
  const raw = arrival.getTime() - (travel + walk + BUFFER_MINUTES) * MINUTE_MS;
  const departAt = new Date(Math.floor(raw / MINUTE_MS) * MINUTE_MS);
  return {
    depart_at: departAt,
    summary: routeSummary(steps),
    is_past: departAt.getTime() < new Date(now).getTime(),
  };
}
