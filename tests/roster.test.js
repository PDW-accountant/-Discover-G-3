import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterKey, sameRoster } from '../src/js/lib/roster.js';

// 실행: npm test   (#96 '찾기'·확정 직전에 방 명단이 바뀌었는지 비교)

const p = (participant_id, nickname, origin_station_id, extra = {}) => ({ participant_id, nickname, origin_station_id, ...extra });
const base = [p('p_a', '감자', 'S0311'), p('p_b', '고구마', 'S0158'), p('p_c', '옥수수', 'S2529')];

test('#96: 같은 사람·닉네임·출발역이면 같은 명단 (순서와 입력 시각은 보지 않는다)', () => {
  const server = [...base].reverse().map((x, i) => ({ ...x, updated_at: `2026-10-07T0${i}:00:00Z` }));
  assert.equal(sameRoster(server, base), true);
  assert.equal(rosterKey(server), rosterKey(base));
});

test('#96: 결과를 본 뒤 한 명이 새로 들어오면 다른 명단', () => {
  assert.equal(sameRoster([...base, p('p_d', '늦은사람', 'S1262')], base), false);
});

test('#96: 누가 출발역이나 닉네임을 바꾸면 다른 명단', () => {
  assert.equal(sameRoster(base.map((x) => (x.participant_id === 'p_b' ? { ...x, origin_station_id: 'S0222' } : x)), base), false);
  assert.equal(sameRoster(base.map((x) => (x.participant_id === 'p_b' ? { ...x, nickname: '고구마2' } : x)), base), false);
});

test('#96: 총무가 한 명을 지우면 다른 명단, 빈 명단끼리는 같다', () => {
  assert.equal(sameRoster(base.slice(0, 2), base), false);
  assert.equal(sameRoster([], []), true);
  assert.equal(sameRoster(undefined, []), true);
});

test('#96: 닉네임이 같아도 사람(participant_id)이 다르면 다른 명단', () => {
  assert.equal(sameRoster([p('p_x', '감자', 'S0311'), ...base.slice(1)], base), false);
});
