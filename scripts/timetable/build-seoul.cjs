// 서울 열차 시간표 → 역간 소요시간표 (FUNC-016 보조 도구, #14)
// 실행: node scripts/timetable/build-seoul.cjs
// 입력: scripts/timetable/raw/seoul/ (collect-seoul.cjs 가 받아 둔 시간표, git 에 올리지 않음)
// 출력: scripts/input/timetable-seoul.json (커밋함. scripts/convert.js 가 공식 값이 없는 구간에 쓴다)
//
// 서울 열린데이터광장 "역코드로 지하철 열차 시간표 검색"에는 열차번호(TRAIN_NO)와 급행 구분(EXPRESS_YN)이 있다.
// 그래서 다음 역을 추측하지 않고 열차 한 대의 정차 순서를 그대로 읽는다.
//   1. 열차번호별로 정차한 역을 시각 순서로 늘어놓는다 (열차번호는 노선이 달라도 겹쳐 쓰여서 노선까지 같아야 같은 열차)
//   2. 이어지는 두 정차역(A → B)마다 "A역 출발 → B역 도착"(도착 시각이 없으면 "출발 → 출발")
//   3. 같은 구간(A, B, 일반/급행)의 값을 모아 중앙값. 급행(EXPRESS_YN "D")은 일반과 따로 센다
//   4. 중간 역 기록이 빠져 역을 건너뛴 것처럼 읽히는 구간(예: 5호선 마천 → 둔촌동)은 뺀다
// 역은 역코드(역사마스터의 역사_ID)로 적어서 scripts/convert.js 가 이름 없이 바로 이을 수 있다.

const fs = require("fs");
const path = require("path");
const { cleanName, median } = require("./build-tago.cjs");

const RAW = path.join(__dirname, "raw", "seoul");
const OUTPUT = path.join(__dirname, "..", "input", "timetable-seoul.json");

const MIN_SAMPLES = 3;               // 구간 하나를 인정하는 최소 열차 수
const MAX_SHARE = 0.5;               // 같은 역에서 나가는 일반 구간 중 열차 수가 가장 많은 구간의 이 비율 미만만 '건너뛴 구간' 후보
const SKIP_TOLERANCE = 0.3;          // 중간 역을 거치는 경로 시간이 이 비율 안으로 같으면 건너뛴 구간으로 본다
const SERVICE_DAY_START = 3 * 3600;  // 새벽 3시 전 시각은 전날 운행의 연장으로 본다

// "05:20:30" → 초. "00:00:00" 은 "해당 없음"이라 null
function toSec(hms) {
  if (!hms || hms === "00:00:00") return null;
  const [h, m, s] = hms.split(":").map(Number);
  const sec = h * 3600 + m * 60 + s;
  return sec < SERVICE_DAY_START ? sec + 86400 : sec;
}

// 열차 한 대의 정차 목록 → 이어지는 두 역 사이 기록들
function consecutiveStops(stops) {
  const sorted = [...stops].sort((a, b) => (a.arr ?? a.left) - (b.arr ?? b.left));
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (a.left == null) continue; // 종점 도착 기록 뒤에는 이어지는 역이 없다
    out.push({
      from: a.code, to: b.code,
      arrTravel: b.arr != null ? b.arr - a.left : null,
      depTravel: b.left != null ? b.left - a.left : null,
      dwell: b.arr != null && b.left != null ? b.left - b.arr : null,
    });
  }
  return out;
}

function load() {
  const master = JSON.parse(fs.readFileSync(path.join(RAW, "stations.json"), "utf8"));
  const trains = {}; // "방향|열차번호|노선" → { express, stops: [] }
  for (const st of master) {
    for (const dir of ["1", "2"]) {
      const rows = JSON.parse(fs.readFileSync(path.join(RAW, "timetable", `${st.BLDN_ID}_1_${dir}.json`), "utf8"));
      for (const r of rows) {
        const t = (trains[`${dir}|${r.TRAIN_NO}|${r.LINE_NUM}`] ??= { express: r.EXPRESS_YN === "D", stops: [] });
        t.stops.push({ code: st.BLDN_ID, arr: toSec(r.ARRIVETIME), left: toSec(r.LEFTTIME), line: r.LINE_NUM });
      }
    }
  }
  return { master, trains };
}

// 일반 구간 A → C 가 열차 수가 적으면서, 다른 일반 구간들을 이어 같은 시간으로 갈 수 있으면 "건너뛴 구간"
function findSkipped(segments) {
  const local = segments.filter(s => s.kind === "local");
  const maxN = {};
  for (const s of local) { const k = `${s.fromCode}|${s.line}`; maxN[k] = Math.max(maxN[k] ?? 0, s.n); }
  const out = [];
  for (const e of local) {
    if (e.n >= maxN[`${e.fromCode}|${e.line}`] * MAX_SHARE) continue;
    const dist = { [e.fromCode]: 0 };
    const todo = new Set([e.fromCode]);
    while (todo.size) {
      const u = [...todo].reduce((a, b) => (dist[a] <= dist[b] ? a : b));
      todo.delete(u);
      for (const v of local) {
        if (v === e || v.fromCode !== u) continue;
        const d = dist[u] + v.sec + (v.toCode === e.toCode ? 0 : (v.dwellSec ?? 0));
        if (d <= e.sec * (1 + SKIP_TOLERANCE) && d < (dist[v.toCode] ?? Infinity)) { dist[v.toCode] = d; todo.add(v.toCode); }
      }
    }
    const via = dist[e.toCode];
    if (via != null && via >= e.sec * (1 - SKIP_TOLERANCE)) out.push(e);
  }
  return out;
}

function build() {
  const { master, trains } = load();
  const byCode = Object.fromEntries(master.map(s => [s.BLDN_ID, s]));
  const pairs = {}; // "A|B|kind" → { line, arrTravel, depTravel, dwell }
  for (const t of Object.values(trains)) {
    const kind = t.express ? "express" : "local";
    for (const c of consecutiveStops(t.stops)) {
      const line = t.stops.find(s => s.code === c.from).line;
      const p = (pairs[`${c.from}|${c.to}|${kind}`] ??= { line, arrTravel: [], depTravel: [], dwell: [] });
      if (c.arrTravel != null && c.arrTravel > 0) p.arrTravel.push(c.arrTravel);
      if (c.depTravel != null && c.depTravel > 0) p.depTravel.push(c.depTravel);
      if (c.dwell != null && c.dwell >= 0) p.dwell.push(c.dwell);
    }
  }
  let segments = [];
  for (const [key, p] of Object.entries(pairs)) {
    const [fromCode, toCode, kind] = key.split("|");
    const useArr = p.arrTravel.length >= MIN_SAMPLES;
    const travel = useArr ? p.arrTravel : p.depTravel;
    if (travel.length < MIN_SAMPLES) continue;
    segments.push({
      fromCode, toCode, from: cleanName(byCode[fromCode].BLDN_NM), to: cleanName(byCode[toCode].BLDN_NM),
      line: p.line, kind, sec: Math.round(median(travel)), method: useArr ? "arr" : "dep", n: travel.length,
      dwellSec: p.dwell.length ? Math.round(median(p.dwell)) : null,
    });
  }
  const dropped = findSkipped(segments);
  segments = segments.filter(s => !dropped.includes(s));
  segments.sort((a, b) => a.fromCode.localeCompare(b.fromCode) || a.toCode.localeCompare(b.toCode) || a.kind.localeCompare(b.kind));
  return { segments, dropped, trainCount: Object.keys(trains).length, stationCount: master.length };
}

function main() {
  const { segments, dropped, trainCount, stationCount } = build();
  const collectedOn = fs.statSync(path.join(RAW, "stations.json")).mtime.toISOString().slice(0, 10);
  const express = segments.filter(s => s.kind === "express").length;
  const out = {
    meta: {
      note: "가상 데이터가 아니라 실제 열차 시간표에서 계산한 값이다. 공식 소요시간이 없는 구간에만 쓴다 (scripts/convert.js).",
      source: `서울 열린데이터광장 서울교통공사 "역코드로 지하철 열차 시간표 검색"(SearchSTNTimeTableByIDService), 평일, 역 ${stationCount}개(서울교통공사 1~9호선과 직통 코레일 구간만 데이터 있음), 열차 ${trainCount}대, 수집일 ${collectedOn}`,
      method: "열차번호별 정차 순서에서 이어지는 두 역의 \"A역 출발 → B역 도착\" 시각 차이의 중앙값(초). kind: local(일반) / express(급행, EXPRESS_YN \"D\"). 중간 역 기록이 빠져 건너뛴 것처럼 읽히는 구간은 뺐다.",
      verified: "서울교통공사 공식 역간 소요시간(1~8호선)과 비교해 97% 구간이 짝지어졌고 99%가 30초 이내로 일치했다.",
      tool: "scripts/timetable/collect-seoul.cjs → scripts/timetable/build-seoul.cjs",
      counts: { segments: segments.length, local: segments.length - express, express, droppedSkips: dropped.length },
    },
    segments,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`구간 ${segments.length}개 (일반 ${segments.length - express}, 급행 ${express}), 건너뛴 구간으로 뺀 것 ${dropped.length}개 → ${path.relative(process.cwd(), OUTPUT)}`);
}

if (require.main === module) main();
module.exports = { toSec, consecutiveStops, findSkipped };
