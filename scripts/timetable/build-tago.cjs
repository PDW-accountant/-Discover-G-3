// TAGO 열차 시간표 → 역간 소요시간표 (FUNC-016 보조 도구, #14)
// 실행: node scripts/timetable/build-tago.cjs
// 입력: scripts/timetable/raw/tago/ (collect-tago.cjs 가 받아 둔 시간표, git 에 올리지 않음)
// 출력: scripts/input/timetable-tago.json (커밋함. scripts/convert.js 가 공식 값이 없는 구간에 쓴다)
//
// 공공데이터포털 국토교통부 TAGO "지하철정보" 시간표에는 열차번호가 없다. 그래서
//   1. "같은 방향 + 같은 종점" 열차끼리 묶고, A역을 출발한 열차가 곧바로 B역에도 도착하면 B를 A의 다음 역으로 본다.
//   2. 다음 역 후보는 역ID 순서로 가까운 역(앞뒤 4칸 이내)으로 좁히고 가까운 후보부터 확인한다.
//      (시간표만 보면, 멀리 있는 역에 몇 대 앞선 열차가 닿는 시각이 우연히 맞아서 가짜 이웃이 생긴다)
//   3. 앞 열차와 간격이 충분히 벌어진 열차만 쓴다 (앞 열차가 아직 B역에 못 닿았으면 a 열차로 착각할 수 있다)
//   4. 구간 하나에 열차가 4대 이상이어야 인정한다. 하루 몇 대뿐인 셔틀(SHUTTLE_STATIONS)만 2대로 낮춘다
// 소요시간 = "A역 출발 → B역 도착" 시각 차이의 평균 (위아래 10%를 뺀다) (도착 시각이 없는 열차뿐이면 "출발 → 출발", method "dep")
// 한쪽 방향만 구해지고 반대 방향이 빠진 구간은 같은 값으로 채운다 (method "mirror", n 0)

const fs = require("fs");
const path = require("path");

const RAW = path.join(__dirname, "raw", "tago");
const OUTPUT = path.join(__dirname, "..", "input", "timetable-tago.json");

const MIN_SAMPLES = 8;       // 구간 하나를 인정하는 최소 열차 수
const MIN_MATCH_RATIO = 0.3; // 한가한 열차 중 이 비율 이상이 B역에도 서야 다음 역 후보 (급행은 서지 않는 역이 있어서 낮게 둔다)
const MAX_RANK = 4;          // 역ID 순서로 앞뒤 몇 칸까지 이웃 후보로 볼지
// 같은 열차끼리 짝지었다면 걸린 시간이 거의 일정하다. 중앙값에서 평균적으로 이만큼(초) 넘게 흩어져 있으면
// 다른 열차와 엉터리로 짝지은 것이라 이웃으로 보지 않는다 (예: 공항철도 인천공항 방향에서 마곡나루→디지털미디어시티를 거꾸로 짝지으면 30~600초로 흩어졌다)
const MAX_SPREAD = 60;
// 앞 열차와 gap 초 이상 벌어진 열차만, window 초 안에 닿으면 짝으로 본다. 열차가 모자라면 조건을 풀어 다시 한다.
// 1단계는 앞 열차와 10분 넘게 벌어져 착각할 일이 거의 없어서 표본이 적어도(4대) 쓴다. 2·3단계는 8대 이상일 때만
// (예: 공항철도 디지털미디어시티→마곡나루는 7분 걸리는데 열차가 4~5분 간격이라, 2단계로 넘어가면 앞 열차와 착각해 150초가 나왔다)
const TIERS = [{ gap: 600, window: 600, min: 4 }, { gap: 360, window: 480, min: MIN_SAMPLES }, { gap: 270, window: 360, min: MIN_SAMPLES }];
const SERVICE_DAY_START = 3 * 3600; // 새벽 3시 전 시각은 전날 운행의 연장으로 보고 24시간을 더한다

// 역ID 순서로는 이웃 후보에 들어오지 않는 연결 (역ID 계열이 달라서). 양쪽에 적는다
//   경의중앙선 서울역 지선: 서울역(4P313) - 신촌(4P314) - 가좌(4K315)
//   경의중앙선 계열이 바뀌는 곳: 효창공원앞(4K311) - 용산(4K110), 응봉(4K115) - 왕십리(4K210), 청량리(4K209) - 회기(4K118)
//   GTX-A 구성(GXAX110) - 동탄(SRAX111): 동탄역은 SRT 와 같이 쓰는 역이라 ID 가 SR 계열이다
const EXTRA_PAIRS = [
  ["MTRKRK4P314", "MTRKRK4K315"],
  ["MTRKRK4K311", "MTRKRK4K110"], ["MTRKRK4K115", "MTRKRK4K210"], ["MTRKRK4K209", "MTRKRK4K118"],
  ["MTRGXAX110", "MTRSRAX111"],
];

// 하루 몇 대만 다니는 셔틀의 역. 열차가 몇 시간 간격이라 앞뒤 열차와 헷갈릴 일이 없어서 최소 표본 수를 낮춘다
//   경의중앙선 문산 - 운천(4K336) - 임진강(4K337): 평일 하루 왕복 2회 (문산 09:20, 17:05 출발)
const SHUTTLE_STATIONS = new Set(["MTRKRK4K336", "MTRKRK4K337"]);
const SHUTTLE_MIN_SAMPLES = 2;
const isShuttle = (...ids) => ids.some((id) => SHUTTLE_STATIONS.has(id));
const EXTRA_NEIGHBORS = {};
for (const [a, b] of EXTRA_PAIRS) { (EXTRA_NEIGHBORS[a] ??= []).push(b); (EXTRA_NEIGHBORS[b] ??= []).push(a); }

// "054415" → 초. 값이 없거나 "0" 이면 null
function toSec(hhmmss) {
  if (!hhmmss || hhmmss === "0") return null;
  const t = String(hhmmss).padStart(6, "0");
  const sec = Number(t.slice(0, 2)) * 3600 + Number(t.slice(2, 4)) * 60 + Number(t.slice(4, 6));
  return sec < SERVICE_DAY_START ? sec + 86400 : sec;
}

// 괄호 설명을 떼고 ("서울대입구(관악구청)" → "서울대입구"), 4글자 이상이면 끝의 '역'을 뗀다 ("하남검단산역" → "하남검단산", "서울역"은 그대로)
// 역 이름 차이(당고개/불암산 등) 보정은 scripts/convert.js 가 scripts/aliases.json 으로 한다
function cleanName(name) {
  const n = String(name).replace(/\(.*?\)/g, "").trim();
  return n.length > 3 && n.endsWith("역") ? n.slice(0, -1) : n;
}

// 위아래 10%씩을 뺀 평균. 신분당·신림·우이신설처럼 시각이 1분 단위로만 적힌 노선은 같은 구간도 열차마다 30초·90초로
// 갈려서 중앙값이 한쪽으로 쏠린다. 평균을 쓰면 실제 시간(그 사이)에 가까워진다
function trimmedMean(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const cut = Math.floor(s.length * 0.1);
  const mid = s.slice(cut, s.length - cut);
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function loadTimetables(stations) {
  const table = {}; // 역ID|방향 → 종점ID → [{ ref, dep, arr }] (시각 순)
  for (const s of stations) {
    for (const dir of ["U", "D"]) {
      const items = JSON.parse(fs.readFileSync(path.join(RAW, "timetable", `${s.subwayStationId}_01_${dir}.json`), "utf8"));
      const byEnd = {};
      for (const it of items) {
        const dep = toSec(it.depTime), arr = toSec(it.arrTime);
        const ref = dep ?? arr;
        if (ref == null) continue;
        (byEnd[it.endSubwayStationId] ??= []).push({ ref, dep, arr });
      }
      for (const list of Object.values(byEnd)) list.sort((a, b) => a.ref - b.ref);
      table[`${s.subwayStationId}|${dir}`] = byEnd;
    }
  }
  return table;
}

// 역ID 의 순서 키. 서울교통공사(MTRS) ID 는 뒤 3자리가 역 번호다 (9호선 "99917" 은 "990917" 과 같은 자리)
function orderKey(id) {
  return /^MTRS[0-9]/.test(id) ? id.slice(-3) : id.replace(/^MTR[A-Z]+/, "");
}

// 같은 운영기관·같은 노선 안에서 ID 순서로 놓고, 역마다 앞뒤 MAX_RANK 칸 안의 역을 가까운 순서로 적는다 (+ EXTRA_NEIGHBORS)
function candidateNeighbors(stations) {
  const lists = {};
  for (const s of stations) (lists[s.subwayStationId.match(/^MTR[A-Z]+/)[0] + "|" + s.subwayRouteName] ??= []).push(s.subwayStationId);
  const out = {};
  const rank = {}; // 역ID → { list, i } (같은 운영기관·노선 안의 순번)
  for (const [list, ids] of Object.entries(lists)) {
    ids.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
    ids.forEach((id, i) => {
      rank[id] = { list, i };
      out[id] = [];
      for (let d = 1; d <= MAX_RANK; d++) out[id].push([ids[i - d], ids[i + d]].filter(Boolean));
      if (EXTRA_NEIGHBORS[id]) out[id].push(EXTRA_NEIGHBORS[id]);
    });
  }
  out.rank = rank;
  return out;
}

// A의 열차 중 출발하는 것(dep 있음)이고 앞 열차와의 간격이 gap 이상인 것
function sparseTrains(list, gap) {
  return list.filter((t, i) => t.dep != null && (i === 0 || t.ref - list[i - 1].ref >= gap));
}

// a 열차를 출발한 직후(window 초 안)에 B역에 닿는 첫 열차
function followingTrain(listB, aRef, window) {
  let lo = 0, hi = listB.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (listB[mid].ref >= aRef + 10) hi = mid; else lo = mid + 1;
  }
  const b = listB[lo];
  return b && b.ref - aRef <= window ? b : null;
}

// 같은 방향·같은 종점 묶음 하나에서 A의 다음 역과 표본을 찾는다. 가까운 후보부터 보고 확인되면 멈춘다
function findNext(aId, group, table, dir, endId, neighbors, allowed = () => true) {
  const listA = table[`${aId}|${dir}`][endId];
  for (const tier of TIERS) {
    const min = isShuttle(aId, endId) ? SHUTTLE_MIN_SAMPLES : tier.min;
    const sparse = sparseTrains(listA, tier.gap);
    if (sparse.length < min) continue;
    for (const ring of neighbors[aId]) {
      let best = null;
      for (const bId of ring) {
        if (!group.has(bId) || !allowed(aId, bId, dir)) continue;
        const listB = table[`${bId}|${dir}`][endId];
        const samples = [];
        for (const a of sparse) {
          const b = followingTrain(listB, a.ref, tier.window);
          if (b) samples.push({ a, b });
        }
        if (samples.length < min || samples.length / sparse.length < MIN_MATCH_RATIO) continue;
        const offsets = samples.map(({ a, b }) => b.ref - a.ref);
        const offset = median(offsets);
        if (median(offsets.map((o) => Math.abs(o - offset))) > MAX_SPREAD) continue;
        if (!best || offset < best.offset) best = { bId, offset, samples };
      }
      if (best) return best;
    }
    return null;
  }
  return null;
}

// 한쪽 방향 구간만 있고 반대가 빠진 곳을 같은 소요시간으로 채운다 (method "mirror", n 0)
function fillMirrors(segments) {
  const have = new Set(segments.map(s => `${s.fromId}|${s.toId}`));
  return segments
    .filter(s => !have.has(`${s.toId}|${s.fromId}`))
    .map(s => ({ fromId: s.toId, toId: s.fromId, from: s.to, to: s.from, line: s.line, sec: s.sec, method: "mirror", n: 0 }));
}

// 같은 방향·종점 묶음마다 역의 다음 역을 찾아 onFound(A, B, 방향, 표본)을 부른다
function collectPairs(stations, table, neighbors, allowed, onFound) {
  for (const dir of ["U", "D"]) {
    const groups = {}; // 종점ID → 그 종점행 열차가 서는 역들
    for (const s of stations) {
      for (const endId of Object.keys(table[`${s.subwayStationId}|${dir}`])) (groups[endId] ??= new Set()).add(s.subwayStationId);
    }
    for (const [endId, group] of Object.entries(groups)) {
      for (const aId of group) {
        const next = findNext(aId, group, table, dir, endId, neighbors, allowed);
        if (next) onFound(aId, next.bId, dir, next.samples);
      }
    }
  }
}

function build() {
  const stations = JSON.parse(fs.readFileSync(path.join(RAW, "stations.json"), "utf8"));
  const byId = Object.fromEntries(stations.map(s => [s.subwayStationId, s]));
  const table = loadTimetables(stations);
  const neighbors = candidateNeighbors(stations);

  // 방향 맞추기: 같은 운영기관·노선·방향(U/D)에서 찾은 이웃이 대부분 순번이 커지는(작아지는) 쪽이면, 다른 역도 그쪽 후보만 본다
  //   (예: 공항철도 서울역 방향 열차에서 마곡나루의 다음 역은 디지털미디어시티인데, 김포공항을 다음 역으로 잘못 고를 수 있었다)
  const isExtra = (a, b) => (EXTRA_NEIGHBORS[a] ?? []).includes(b);
  const signOf = (a, b) => (neighbors.rank[a].list === neighbors.rank[b].list ? Math.sign(neighbors.rank[b].i - neighbors.rank[a].i) : 0);
  const votes = {};
  collectPairs(stations, table, neighbors, () => true, (aId, bId, dir) => {
    if (isExtra(aId, bId)) return;
    const k = `${neighbors.rank[aId].list}|${dir}`;
    (votes[k] ??= { up: 0, down: 0 })[signOf(aId, bId) > 0 ? "up" : "down"]++;
  });
  const allowed = (aId, bId, dir) => {
    if (isExtra(aId, bId)) return true;
    const v = votes[`${neighbors.rank[aId].list}|${dir}`];
    if (!v || v.up === v.down) return true;
    return signOf(aId, bId) === (v.up > v.down ? 1 : -1);
  };
  const pairs = {}; // "A|B" → { arrTravel: [], depTravel: [] }
  collectPairs(stations, table, neighbors, allowed, (aId, bId, dir, samples) => {
    const p = (pairs[`${aId}|${bId}`] ??= { arrTravel: [], depTravel: [] });
    for (const { a, b } of samples) {
      const aDep = a.dep ?? a.ref;
      if (b.arr != null && b.arr > aDep) p.arrTravel.push(b.arr - aDep);
      if (b.dep != null) p.depTravel.push(b.dep - aDep);
    }
  });
  const segments = [];
  for (const [key, p] of Object.entries(pairs)) {
    const [fromId, toId] = key.split("|");
    const need = isShuttle(fromId, toId) ? SHUTTLE_MIN_SAMPLES : 4;
    const useArr = p.arrTravel.length >= need;
    const travel = useArr ? p.arrTravel : p.depTravel;
    if (travel.length < need) continue;
    segments.push({
      fromId, toId, from: cleanName(byId[fromId].subwayStationName), to: cleanName(byId[toId].subwayStationName),
      line: byId[fromId].subwayRouteName, sec: Math.round(trimmedMean(travel)), method: useArr ? "arr" : "dep", n: travel.length,
    });
  }
  const measured = segments.length;
  segments.push(...fillMirrors(segments));
  segments.sort((a, b) => a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId));
  const used = new Set(segments.flatMap(s => [s.fromId, s.toId]));
  return { segments, measured, stationCount: stations.length, unused: stations.filter(s => !used.has(s.subwayStationId)) };
}

function main() {
  const { segments, measured, stationCount, unused } = build();
  const collectedOn = fs.statSync(path.join(RAW, "stations.json")).mtime.toISOString().slice(0, 10);
  const out = {
    meta: {
      note: "가상 데이터가 아니라 실제 열차 시간표에서 계산한 값이다. 공식 소요시간이 없는 구간에만 쓴다 (scripts/convert.js).",
      source: `공공데이터포털 국토교통부 TAGO "지하철정보" 오픈API GetSubwaySttnAcctoSchdulList, 평일 시간표, 수도권 ${stationCount}개 역, 수집일 ${collectedOn}`,
      method: "열차번호가 없어 같은 방향·같은 종점 열차를 이어 \"A역 출발 → B역 도착\" 시각 차이의 평균(위아래 10% 제외, 초)을 구했다. method: arr(도착 시각 기준) / dep(출발→출발) / mirror(반대 방향 값으로 채움).",
      verified: "서울교통공사 공식 역간 소요시간(1~8호선)과 비교해 99%가 30초 이내로 일치했다. 열차번호가 없어 급행이 섞인 노선(9호선)은 정확도가 낮아 서울 시간표(timetable-seoul.json)를 먼저 쓴다.",
      tool: "scripts/timetable/collect-tago.cjs → scripts/timetable/build-tago.cjs",
      counts: { segments: segments.length, measured, mirror: segments.length - measured },
    },
    segments,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`구간 ${segments.length}개 (시간표로 계산 ${measured}개 + 반대 방향 채움 ${segments.length - measured}개) → ${path.relative(process.cwd(), OUTPUT)}`);
  if (unused.length) console.log(`구간을 못 찾은 역 ${unused.length}개:`, unused.map(s => `${s.subwayStationName}(${s.subwayRouteName})`).join(", "));
}

if (require.main === module) main();
module.exports = { trimmedMean, toSec, cleanName, median, orderKey, sparseTrains, followingTrain, fillMirrors };
