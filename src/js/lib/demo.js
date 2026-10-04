// 예시로 해보기 (개발 A, 개발 C) — FUNC-004
// data/demo.json의 시나리오(scripts/input/sheet-demo.csv 에서 변환)로 모임 목적·도착 시간·참여자·출발역을 채운다.
// 도착 시간은 시나리오의 시각(HH:MM)이 다음에 오는 때라서 항상 현재 이후다 (오늘 그 시각이 지났으면 내일).
// 이동시간 계산은 외부 호출 없이 결정적이라 결과를 따로 저장하지 않는다. expected 는 자동 테스트의 기대값으로만 쓴다.

/**
 * @param {{scenarios?: Array<{id, purpose, arrival, participants}>}} demo data/demo.json
 * @param {string} scenarioId
 * @param {Date} [now]
 * @returns {{request:{purpose, arrival_time}, participants:Array<{participant_id, nickname, origin_station_id}>}|null}
 *   없는 시나리오면 null
 */
export function loadScenario(demo, scenarioId, now = new Date()) {
  const scenario = demo?.scenarios?.find((s) => s.id === scenarioId);
  if (!scenario) return null;
  const [hour, minute] = scenario.arrival.split(':').map(Number);
  const arrival = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  if (arrival <= now) arrival.setDate(arrival.getDate() + 1);
  return {
    request: { purpose: scenario.purpose, arrival_time: arrival.toISOString() },
    participants: scenario.participants.map((p) => ({ ...p })),
  };
}
