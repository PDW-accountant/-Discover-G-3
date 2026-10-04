// 지하철 이동시간 계산 (개발 C) — FUNC-006
// 외부 API 없이 공공데이터로 만든 data/transit-graph.json에서 최단 시간을 구한다 (CLAUDE.md 7장).
// 그래프 형식 (scripts/convert.js 가 만듦, #14 10/4 변경):
//   노드 = "역id:계통id". 계통 = 갈아타지 않고 쭉 갈 수 있는 열차 노선 단위 (예: 1-incheon, 2-main, 5-macheon, 9, 9-express)
//   routes = [{ id, line, name, express }]  (steps 의 호선·급행 표시에 쓴다)
//   edges  = { from, to, minutes, type, estimated?, assumed?, filled? }
//     'ride'     같은 계통 인접 역 운행시간(분). estimated: true 는 공식 값이 없어 열차 시간표로 계산한 값
//     'transfer' 같은 역 다른 계통 환승 도보시간(분, 대기 미포함) → 여기에 WAIT_MINUTES 를 더한다. 환승 횟수 +1
//     'swap'     같은 노선 급행↔일반 갈아타기(0분) → WAIT_MINUTES 는 더하지만 환승 횟수에는 세지 않는다
// 정차 시간(#25 10/4): 역간 시간(ride)은 달리는 시간만이라, 열차가 중간에 서는 역마다 DWELL_MINUTES(30초)를 더한다.
//   ride 간선마다 더한 뒤 구간(같은 계통으로 쭉 탄 부분)마다 내리는 역 1번을 빼서 중간 역만 남긴다.
//   급행 계통은 서는 역끼리만 이어져 있어 건너뛰는 역에는 붙지 않는다.

import { DWELL_MINUTES, WAIT_MINUTES } from '../config.js';
import { estimateTravel } from './geo.js';

const prepared = new WeakMap(); // 그래프 객체 → 계산용으로 정리한 값 (한 번만 만든다)

/** 그래프를 노드 번호·인접 목록·역별 노드 목록으로 정리한다. 형식이 아니면 null. */
function prepare(graph) {
  if (!Array.isArray(graph?.edges)) return null;
  if (prepared.has(graph)) return prepared.get(graph);
  const index = new Map();
  const station = [], route = [], adj = [];
  const nodeOf = (key) => {
    if (!index.has(key)) {
      const cut = key.indexOf(':');
      index.set(key, station.length);
      station.push(key.slice(0, cut));
      route.push(key.slice(cut + 1));
      adj.push([]);
    }
    return index.get(key);
  };
  for (const e of graph.edges) {
    const from = nodeOf(e.from), to = nodeOf(e.to);
    adj[from].push({ to, type: e.type, cost: e.type === 'ride' ? e.minutes + DWELL_MINUTES : e.minutes + WAIT_MINUTES });
  }
  const byStation = new Map();
  station.forEach((id, node) => (byStation.get(id) ?? byStation.set(id, []).get(id)).push(node));
  const routes = new Map((graph.routes ?? []).map((r) => [r.id, r]));
  const result = { station, route, adj, byStation, routes };
  prepared.set(graph, result);
  return result;
}

/** 출발역의 모든 계통 노드에서 다익스트라 1회. 같은 거리면 노드 번호가 작은 쪽부터 꺼내 결과가 항상 같다. */
function shortestFrom(g, stationId) {
  const n = g.station.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const prevType = new Array(n);
  const heap = [];
  const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!less(heap[i], heap[p])) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l], heap[m])) m = l;
        if (r < heap.length && less(heap[r], heap[m])) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };
  for (const node of g.byStation.get(stationId) ?? []) {
    dist[node] = 0;
    push([0, node]);
  }
  while (heap.length) {
    const [d, u] = pop();
    if (d > dist[u]) continue;
    for (const { to, type, cost } of g.adj[u]) {
      if (d + cost < dist[to]) {
        dist[to] = d + cost;
        prev[to] = u;
        prevType[to] = type;
        push([dist[to], to]);
      }
    }
  }
  return { dist, prev, prevType };
}

/** 소수 둘째 자리에서 정리한 뒤 분 단위 올림 (더하기 오차로 16.0000001 → 17이 되지 않게) */
const ceilMinutes = (x) => Math.ceil(Math.round(x * 100) / 100);

/** 다익스트라 결과에서 도착역까지의 결과를 만든다. 도달할 수 없으면 null. */
function routeTo(g, tree, toId) {
  let best = -1;
  for (const node of g.byStation.get(toId) ?? []) {
    if (tree.dist[node] < (best < 0 ? Infinity : tree.dist[best])) best = node;
  }
  if (best < 0) return null;

  const path = [best];
  while (tree.prev[path[0]] >= 0) path.unshift(tree.prev[path[0]]);

  // 같은 계통으로 이어 탄 구간을 하나로 묶는다. 환승·급행 갈아타기에서 구간이 나뉜다.
  // 구간 사이의 갈아타기는 다음 구간의 change에 담는다: { type: 'transfer'|'swap', walk: 도보 분, wait: 대기 분 }
  const steps = [];
  let transfers = 0, current = null, pending = null;
  for (let i = 1; i < path.length; i++) {
    const u = path[i - 1], v = path[i];
    const type = tree.prevType[v];
    const cost = tree.dist[v] - tree.dist[u];
    if (type === 'ride') {
      if (current) {
        current.to = g.station[v];
        current.via.push(g.station[v]);
        current.minutes += cost;
      } else {
        const r = g.routes.get(g.route[u]);
        current = { line: r?.line ?? g.route[u], express: Boolean(r?.express), from: g.station[u], to: g.station[v], minutes: cost, via: [g.station[u], g.station[v]] };
        if (pending) current.change = pending;
        pending = null;
        steps.push(current);
      }
    } else {
      if (type === 'transfer') transfers += 1;
      pending = {
        type: type === 'transfer' || pending?.type === 'transfer' ? 'transfer' : 'swap',
        walk: (pending?.walk ?? 0) + (cost - WAIT_MINUTES),
        wait: (pending?.wait ?? 0) + WAIT_MINUTES,
      };
      current = null;
    }
  }
  // 구간마다 내리는 역의 정차 1번을 빼서 중간에 서는 역의 정차만 남긴다
  for (const s of steps) {
    s.minutes = Math.max(1, Math.round(s.minutes - DWELL_MINUTES));
    if (s.change) s.change = { ...s.change, walk: Math.round(s.change.walk) };
  }

  return { minutes: ceilMinutes(tree.dist[best] + WAIT_MINUTES - DWELL_MINUTES * steps.length), transfers, steps, is_estimated: false };
}

/** 한 출발역 기준 계산기(다익스트라 1회). 그래프에 없는 역·도달할 수 없는 역은 직선거리 예상 시간으로 대체한다. */
function calculatorFrom(graph, from) {
  const g = prepare(graph);
  const tree = g && g.byStation.has(from.id) ? shortestFrom(g, from.id) : null;
  return (to) => {
    if (from.id === to.id) return { minutes: 0, transfers: 0, steps: [], is_estimated: false };
    return (tree && routeTo(g, tree, to.id)) ?? estimateTravel(from, to);
  };
}

/**
 * 출발역 → 도착역 최단 이동시간 (다익스트라). 출발역이 여러 계통이면 모든 계통 노드에서 시작한다.
 * 결과 = 운행시간 합 + 중간 정차 DWELL_MINUTES × 서는 역 수 + 환승 도보시간 합 + WAIT_MINUTES × (환승·급행 갈아타기 횟수 + 1), 분 단위 올림.
 * 같은 역이면 0분. 그래프에서 도달할 수 없거나 그래프에 없는 역이면 geo.estimateTravel로 대체(is_estimated=true).
 * @param {object|null} graph data/transit-graph.json
 * @param {Station} fromStation
 * @param {Station} toStation
 * @returns {{minutes:number, transfers:number, steps:Array<{line, express, from, to, minutes, via, change?}>, is_estimated:boolean}}
 *   transfers 는 급행↔일반 갈아타기(swap)를 세지 않는다. steps 의 from·to 는 역 id, line 은 호선('1', '9', '경의중앙' 등).
 *   steps[i].via 는 그 구간에서 열차가 서는 역 id 목록(승차역~하차역, 지도 경로선용 #16).
 *   steps[i].minutes 는 중간 정차 포함. 두 번째 구간부터 change = { type: 'transfer'|'swap', walk: 도보 분, wait: 대기 분 }(그 구간을 타기 전 갈아타기)
 */
export function travelTime(graph, fromStation, toStation) {
  return calculatorFrom(graph, fromStation)(toStation);
}

/**
 * 참여자 × 후보 역 이동시간을 한 번에 계산 (참여자마다 다익스트라 1회. 9명 × 후보 10곳도 브라우저에서 1초 안, NFR-001).
 * @param {object|null} graph data/transit-graph.json
 * @param {Array<{participant_id, origin_station_id}>} participants
 * @param {Array<Station|string>} candidates 후보 역 (Station 또는 역 id)
 * @param {Object<string, Station>} stationsById
 * @returns {Object<string, Object<string, ReturnType<typeof travelTime>>>} 참여자 id → 역 id → 결과
 */
export function travelTimes(graph, participants, candidates, stationsById) {
  const station = (s) => (typeof s === 'string' ? stationsById[s] ?? { id: s } : s);
  const targets = candidates.map(station);
  return Object.fromEntries(participants.map((p) => {
    const calc = calculatorFrom(graph, station(p.origin_station_id));
    return [p.participant_id, Object.fromEntries(targets.map((to) => [to.id, calc(to)]))];
  }));
}
