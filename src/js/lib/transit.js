// 지하철 이동시간 계산 (개발 C) — FUNC-006
// 외부 API 없이 공공데이터로 만든 data/transit-graph.json에서 최단 시간을 구한다 (CLAUDE.md 7장).
// 그래프 형식 (scripts/convert.js 가 만듦, #14 10/4 변경):
//   노드 = "역id:계통id". 계통 = 갈아타지 않고 쭉 갈 수 있는 열차 노선 단위 (예: 1-incheon, 2-main, 5-macheon, 9, 9-express)
//   routes = [{ id, line, name, express }]  (steps 의 호선·급행 표시에 쓴다)
//   edges  = { from, to, minutes, type, estimated?, assumed?, filled? }
//     'ride'     같은 계통 인접 역 운행시간(분). estimated: true 는 공식 값이 없어 열차 시간표로 계산한 값
//     'transfer' 같은 역 다른 계통 환승 도보시간(분, 대기 미포함) → 여기에 WAIT_MINUTES 를 더한다. 환승 횟수 +1
//     'swap'     같은 노선 급행↔일반 갈아타기(0분) → WAIT_MINUTES 는 더하지만 환승 횟수에는 세지 않는다

import { estimateTravel } from './geo.js';

export const WAIT_MINUTES = 3; // 배차 대기 상수. 검증 결과 보고 조정 (CLAUDE.md 10장 미결)

const stationOf = (node) => node.slice(0, node.indexOf(':'));
const routeOf = (node) => node.slice(node.indexOf(':') + 1);

// 그래프를 한 번만 인접 목록으로 바꿔 둔다(같은 graph 객체면 재사용).
const prepared = new WeakMap();

function prepare(graph) {
  let ready = prepared.get(graph);
  if (ready) return ready;
  const next = new Map();          // 노드 → [{to, cost, type}]
  const nodesByStation = new Map(); // 역 id → [노드]
  const addNode = (node) => {
    if (next.has(node)) return;
    next.set(node, []);
    const id = stationOf(node);
    if (!nodesByStation.has(id)) nodesByStation.set(id, []);
    nodesByStation.get(id).push(node);
  };
  for (const e of graph.edges ?? []) {
    addNode(e.from);
    addNode(e.to);
    const cost = e.type === 'ride' ? e.minutes : e.minutes + WAIT_MINUTES; // 환승·급행 갈아타기는 대기를 간선에 넣는다
    next.get(e.from).push({ to: e.to, cost, type: e.type });
  }
  const routes = new Map((graph.routes ?? []).map((r) => [r.id, r]));
  ready = { next, nodesByStation, routes };
  prepared.set(graph, ready);
  return ready;
}

/** 작은 이진 힙 (다익스트라용). */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** 출발역의 모든 계통 노드에서 다익스트라 한 번. @returns {{dist: Map, prev: Map}|null} 그래프에 없는 역이면 null */
function shortestFrom(ready, fromId) {
  const starts = ready.nodesByStation.get(fromId);
  if (!starts?.length) return null;
  const dist = new Map();
  const prev = new Map(); // 노드 → { node, type }
  const heap = new MinHeap();
  for (const node of starts) {
    dist.set(node, 0);
    heap.push([0, node]);
  }
  while (heap.size) {
    const [d, node] = heap.pop();
    if (d > dist.get(node)) continue;
    for (const edge of ready.next.get(node)) {
      const nd = d + edge.cost;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { node, type: edge.type });
        heap.push([nd, edge.to]);
      }
    }
  }
  return { dist, prev };
}

/** 최단 경로를 구간(같은 계통으로 쭉 탄 구간)으로 묶는다. */
function pathTo(ready, search, target) {
  const edges = [];
  for (let node = target; search.prev.has(node);) {
    const { node: from, type } = search.prev.get(node);
    edges.unshift({ from, to: node, type, minutes: search.dist.get(node) - search.dist.get(from) });
    node = from;
  }
  const steps = [];
  let transfers = 0;
  for (const e of edges) {
    if (e.type === 'transfer') transfers += 1;
    if (e.type !== 'ride') continue;
    const route = routeOf(e.from);
    const last = steps[steps.length - 1];
    if (last && last.route === route && last.to === stationOf(e.from)) {
      last.to = stationOf(e.to);
      last.minutes += e.minutes;
    } else {
      const info = ready.routes.get(route);
      steps.push({ route, line: info?.line ?? route, express: info?.express === true, from: stationOf(e.from), to: stationOf(e.to), minutes: e.minutes });
    }
  }
  return { transfers, steps: steps.map((s) => ({ ...s, minutes: Math.round(s.minutes) })) };
}

/** 이미 구한 다익스트라 결과에서 도착역까지의 결과를 만든다. 도달할 수 없으면 null. */
function resultFor(ready, search, toId) {
  let best = null;
  for (const node of ready.nodesByStation.get(toId) ?? []) {
    const d = search.dist.get(node);
    if (d !== undefined && (best === null || d < search.dist.get(best))) best = node;
  }
  if (best === null) return null;
  const { transfers, steps } = pathTo(ready, search, best);
  // 처음 탈 때 대기 1번을 더한다(환승 대기는 이미 간선에 들어 있다). 부동소수 오차로 올림이 1분 커지지 않게 소수 6자리에서 자른다.
  const minutes = Math.ceil(Number((search.dist.get(best) + WAIT_MINUTES).toFixed(6)));
  return { minutes, transfers, steps, is_estimated: false };
}

const SAME_STATION = () => ({ minutes: 0, transfers: 0, steps: [], is_estimated: false });

/**
 * 출발역 → 도착역 최단 이동시간 (다익스트라). 출발역이 여러 호선이면 모든 호선 노드에서 시작한다.
 * 결과 = 운행시간 합 + 환승시간 합 + WAIT_MINUTES × (환승 횟수 + 1), 분 단위 올림.
 * 같은 역이면 0분. 그래프에서 도달할 수 없거나 그래프에 없는 역이면 geo.estimateTravel로 대체(is_estimated=true).
 * @returns {{minutes:number, transfers:number, steps:Array<{line, express, from, to, minutes}>, is_estimated:boolean}}
 *   steps의 from·to는 역 id
 */
export function travelTime(graph, fromStation, toStation) {
  if (fromStation.id === toStation.id) return SAME_STATION();
  if (!graph?.edges) return estimateTravel(fromStation, toStation);
  const ready = prepare(graph);
  const search = shortestFrom(ready, fromStation.id);
  return (search && resultFor(ready, search, toStation.id)) ?? estimateTravel(fromStation, toStation);
}

/**
 * 참여자 × 후보 역 이동시간을 한 번에 계산 (후보 전체 × 최대 9명, 브라우저에서 1초 안, NFR-001).
 * 참여자마다 다익스트라를 한 번만 돌려 모든 후보 역의 값을 읽는다.
 * @param {Array<{participant_id, origin_station_id}>} participants
 * @param {Station[]} candidates
 * @param {Object<string, Station>|Map<string, Station>} stationsById
 * @returns {Object<string, Object<string, ReturnType<typeof travelTime>>>} 참여자 id → 역 id → 결과
 */
export function travelTimes(graph, participants, candidates, stationsById) {
  const lookup = (id) => (stationsById instanceof Map ? stationsById.get(id) : stationsById[id]);
  const ready = graph?.edges ? prepare(graph) : null;
  const times = {};
  for (const p of participants) {
    const from = lookup(p.origin_station_id);
    if (!from) throw new Error(`출발역 정보가 없습니다: ${p.origin_station_id}`);
    const search = ready ? shortestFrom(ready, from.id) : null;
    times[p.participant_id] = Object.fromEntries(candidates.map((to) => {
      if (from.id === to.id) return [to.id, SAME_STATION()];
      return [to.id, (search && resultFor(ready, search, to.id)) ?? estimateTravel(from, to)];
    }));
  }
  return times;
}
