// 권장 출발 시각 (개발 C) — FUNC-025

export const BUFFER_MINUTES = 10; // 여유 시간 (10/3 확정)

/**
 * 권장 출발 시각 = 도착 희망 시각 − 소요시간 − 여유 10분 (분 단위 내림).
 * 예: 18:00 도착 · 24분 → 17:26
 * @param {Date} arrivalTime
 * @param {number} minutes
 * @param {Array} steps 경로 단계 (이동 방법 요약용: 첫 노선, 환승 횟수)
 * @param {Date} [now]
 * @returns {{depart_at: Date, summary: string, is_past: boolean}} is_past면 화면에 '지금 출발하세요'
 */
export function departureAdvice(arrivalTime, minutes, steps = [], now = new Date()) {
  throw new Error('아직 구현되지 않았습니다');
}
