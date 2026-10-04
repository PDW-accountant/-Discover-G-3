// 콘텐츠팀 시트 + 공공데이터 → data/*.json 변환 (개발 C) — FUNC-016 (#14)
// 실행: node scripts/convert.js   검사 결과가 1건 이상이면 종료 코드 1 (파일은 그래도 만든다)
// 입력: scripts/input/ (출처·받는 법은 scripts/input/README.md), 역 이름 보정·서울 경계·운행이 드문 역: scripts/aliases.json
// 출력: data/stations.json, data/transit-graph.json, data/candidates.json, data/places.json, data/demo.json
// JSON은 손으로 고치지 않고 항상 이 스크립트로 만든다.
//
// 지하철 그래프 원칙 (#14 "보완 방법", 10/4 결정)
//   - 서울교통공사 공식 역간 소요시간(1~8호선 공사 구간)이 있으면 그대로 쓴다.
//   - 공식 값이 없는 구간만 실제 열차 시간표로 계산한 추정값을 쓴다 (간선에 estimated: true).
//     서울 열차 시간표(열차번호 기반, 급행 구분) → 거기 없으면 TAGO 시간표.
//   - 수도권에서 계산할 수 있는 모든 노선·역을 넣는다. 출발역은 수도권 전체에서 고른다(10/4 결정). 역마다 서울 여부(seoul)도 적어 둔다.
//   - 노드 = (역 id, 계통). 계통은 갈아타지 않고 쭉 갈 수 있는 열차 노선 단위 (예: 1호선 인천 방면·천안 방면, 9호선 일반·급행).
//   - 환승 도보시간: 서울교통공사 서울 도시철도 환승정보(방면별 평균) → 환승역 거리·소요시간 → 반대 방향 값.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = join(ROOT, 'scripts', 'input');
const DATA = join(ROOT, 'data');

// ---------- 설정 ----------

export const SEOUL_BOX = { minLat: 37.413, maxLat: 37.715, minLng: 126.734, maxLng: 127.269 };
export const SAME_STATION_KM = 0.6;     // 이름이 같고 이 거리 안이면 같은 역(환승역)으로 합친다
export const DEFAULT_WALK_SEC = 120;    // 공식 환승 자료가 없는 서울 밖 환승: 도보 2분 (대기 3분을 더하면 5분)
const SKIP_TOLERANCE = 0.3;             // 중간 역을 거치는 경로와 시간이 이 비율 안으로 같으면 '역을 건너뛴 구간'으로 본다
const MIN_CANDIDATES = 8;
const PURPOSES = { '회식/식사': '회식', '회의/스터디': '회의', '오락/게임': '오락' };

// 노선 표시 순서 (stations.json 의 lines 배열)
export const LINE_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '경의중앙', '수인분당', '경춘', '공항철도', '신분당',
  '경강', '서해', '김포골드', '신림', '우이신설', '의정부', '에버라인', '인천1', '인천2', 'GTX-A'];
const LINE_NAMES = { 경의중앙: '경의중앙선', 수인분당: '수인분당선', 경춘: '경춘선', 공항철도: '공항철도', 신분당: '신분당선', 경강: '경강선',
  서해: '서해선', 김포골드: '김포골드라인', 신림: '신림선', 우이신설: '우이신설선', 의정부: '의정부경전철', 에버라인: '에버라인',
  인천1: '인천1호선', 인천2: '인천2호선', 'GTX-A': 'GTX-A' };
const lineName = (line) => LINE_NAMES[line] ?? `${line}호선`;

// 역사마스터 '호선'(법정 노선명) → 그 역을 지나는 운행 노선 후보. 이름이 같은 역을 가릴 때만 쓴다 (운행 노선은 그래프에서 정한다)
const MASTER_ROUTE_LINES = {
  '1호선': ['1'], 경부선: ['1'], 경인선: ['1'], 장항선: ['1'], 경원선: ['1', '경의중앙'], '2호선': ['2'], '3호선': ['3'], 일산선: ['3'],
  '4호선': ['4'], 과천선: ['4'], 안산선: ['4', '수인분당'], 진접선: ['4'], '5호선': ['5'], '6호선': ['6'], '7호선': ['7'], '7호선(인천)': ['7'],
  '8호선': ['8'], 별내선: ['8'], '9호선': ['9'], '9호선(연장)': ['9'], 중앙선: ['경의중앙'], 경의중앙선: ['경의중앙'], 분당선: ['수인분당'],
  수인선: ['수인분당'], 경춘선: ['경춘'], 경강선: ['경강'], 공항철도1호선: ['공항철도'], 신분당선: ['신분당'], '신분당선(연장)': ['신분당'],
  '신분당선(연장2)': ['신분당'], 서해선: ['서해'], 김포골드라인: ['김포골드'], 신림선: ['신림'], 우이신설선: ['우이신설'], 의정부선: ['의정부'],
  에버라인선: ['에버라인'], 인천1호선: ['인천1'], 인천2호선: ['인천2'], '수도권 광역급행철도': ['GTX-A'],
};
// 시간표·환승 자료의 노선 표기 → 노선
const LINE_LABELS = {
  공항: '공항철도', 공항철도: '공항철도', 김포골드라인: '김포골드', 인천1호선: '인천1', 인천선: '인천1', 인천2호선: '인천2', 인천2: '인천2',
  서해선: '서해', 신림선: '신림', 경의선: '경의중앙', 경의중앙선: '경의중앙', 경춘선: '경춘', 수인분당선: '수인분당', 신분당선: '신분당',
  우이신설경전철: '우이신설', 우이신설선: '우이신설', 의정부경전철: '의정부', 경강선: '경강', 경원선: '1',
};
export function lineOf(label) {
  const s = String(label ?? '').trim();
  const m = /^0?(\d)(호선)?$/.exec(s);
  if (m) return m[1];
  return LINE_LABELS[s] ?? s;
}
// 역코드(역사_ID) 앞 두 자리 → 노선. 코레일 코드(1x)는 노선이 섞여 있어 넣지 않는다 (방면 역으로 찾는다)
const CODE_LINES = { '01': '1', '02': '2', '03': '3', '04': '4', 25: '5', 26: '6', 27: '7', 28: '8', 37: '7', 41: '9',
  42: '공항철도', 43: '신분당', 44: '신림', 45: '에버라인', 46: '의정부', 47: '우이신설', 48: '서해', 49: '김포골드', 31: '인천1', 32: '인천2' };

// 공식 역간 소요시간 CSV 로 만드는 계통 (지선·순환은 연속 행으로 추측하지 않고 여기서 정한다)
//   sections: CSV 의 그 호선 "from 줄 ~ to 줄". branchFrom: 지선이 갈라지는 역. oneWay: CSV 순서 방향으로만
const OFFICIAL_ROUTES = [
  { id: '1', line: '1', sections: [{ from: '서울', to: '청량리' }] },
  { id: '2-main', line: '2', name: '2호선 본선', sections: [{ from: '시청', to: '시청' }] },
  { id: '2-seongsu', line: '2', name: '2호선 성수지선', sections: [{ branchFrom: '성수', from: '용답', to: '신설동' }] },
  { id: '2-sinjeong', line: '2', name: '2호선 신정지선', sections: [{ branchFrom: '신도림', from: '도림천', to: '까치산' }] },
  { id: '3', line: '3', sections: [{ from: '지축', to: '오금' }] },
  { id: '4', line: '4', sections: [{ from: '불암산', to: '남태령' }] },
  { id: '5-hanam', line: '5', name: '5호선 하남검단산 방면', sections: [{ from: '방화', to: '하남검단산' }] },
  { id: '5-macheon', line: '5', name: '5호선 마천 방면', sections: [{ from: '방화', to: '강동' }, { branchFrom: '강동', from: '둔촌동', to: '마천' }] },
  { id: '6', line: '6', name: '6호선', sections: [{ from: '응암', to: '응암', oneWay: true }, { from: '응암', to: '신내' }] },
  { id: '7', line: '7', sections: [{ from: '장암', to: '온수' }] },
  { id: '8', line: '8', sections: [{ from: '암사역사공원', to: '모란' }] },
];
// 공식 CSV 가 노선 전체를 덮는 노선 (시간표 값을 쓰지 않고, 계통도 OFFICIAL_ROUTES 그대로)
const OFFICIAL_ONLY_LINES = new Set(['2', '5', '6']);
// 같은 노선 안에서 갈라지는 곳 (그래프에서 계산): 갈림 역과, 갈라진 두 방향의 첫 역
const SPLITS = {
  1: { at: '구로', branches: [{ id: '1-incheon', name: '1호선 인천 방면', first: '구일' }, { id: '1-cheonan', name: '1호선 천안 방면', first: '가산디지털단지' }] },
};
// 본선과 따로 다니는 지선·셔틀. 마지막 역에서 본선과 갈아탄다
//   경의중앙선 서울역 지선 (서울역 - 신촌 - 가좌), 임진강 셔틀 (임진강 - 운천 - 문산, 하루 왕복 2회)
const BRANCH_ROUTES = {
  경의중앙: [
    { id: '경의중앙-seoul', name: '경의중앙선 서울역 지선', stations: ['서울역', '신촌(경의중앙)', '가좌'] },
    { id: '경의중앙-imjingang', name: '경의중앙선 임진강 셔틀', stations: ['임진강', '운천', '문산'] },
  ],
};
// 급행을 따로 두는 노선 (서울 열차 시간표의 급행 구분이 있는 노선)
const EXPRESS_LINES = new Set(['1', '9']);
// 환승이 꼭 있어야 하는 같은 노선 계통 쌍 (지선이 갈라지는 역)
const BRANCH_TRANSFERS = [
  ['성수', '2-main', '2-seongsu'], ['신도림', '2-main', '2-sinjeong'], ['강동', '5-hanam', '5-macheon'],
  ['구로', '1-incheon', '1-cheonan'], ['가좌', '경의중앙', '경의중앙-seoul'], ['문산', '경의중앙', '경의중앙-imjingang'],
];
// 공식 환승 자료가 없는 서울 안 환승의 가정값 (도보 분). 이유를 함께 적는다
const ASSUMED_TRANSFERS = [
  { station: '구로', routes: ['1-incheon', '1-cheonan'], walkMinutes: 2, reason: '1호선 경인선↔경부선 갈아타기. 공식 환승 자료 없음 → 기본값' },
  { station: '가좌', routes: ['경의중앙', '경의중앙-seoul'], walkMinutes: 2, reason: '경의중앙선 본선↔서울역 지선 갈아타기. 공식 환승 자료 없음 → 기본값' },
];

// ---------- 읽기 ----------

// UTF-8 로 읽고, 깨진 글자가 있으면 EUC-KR(CP949)로 다시 읽는다 (BOM 은 뗀다)
export function decodeText(bytes) {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('euc-kr').decode(bytes);
}

// CSV → 행 배열 (따옴표 안의 쉼표·줄바꿈, "" 이스케이프 처리)
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// CSV 파일 → [{열 이름: 값}]
function readTable(file) {
  const [header, ...rows] = parseCsv(decodeText(readFileSync(join(INPUT, file))));
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

// "01:30" → 90 (초)
export function toSeconds(mmss) {
  const m = /^(\d+):(\d{2})$/.exec(String(mmss).trim());
  if (!m) throw new Error(`시간 형식이 이상해요: "${mmss}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}
export const toMinutes = (sec) => Math.round((sec / 60) * 100) / 100;

// ---------- 역 이름 ----------

const stripParen = (name) => String(name ?? '').replace(/\(.*?\)/g, '').replace(/\s+/g, '');
/** 맞추기용 정규화: 괄호·공백·끝의 '역' 제거 ("서울역" → "서울", "강남역" → "강남") */
export function matchKey(name) {
  const s = stripParen(name);
  return s.length > 1 && s.endsWith('역') ? s.slice(0, -1) : s;
}
/** 화면에 쓸 공식 이름. aliases(호선별 → 공통) 순서로 찾고, 없으면 괄호·공백·끝의 '역'을 뗀 이름 ("서울역" → "서울". 화면이 "{name}역"으로 붙여 쓴다) */
export function canonicalName(raw, lines, aliases) {
  const key = matchKey(raw);
  for (const line of lines) if (aliases.namesByLine?.[`${line}:${key}`]) return aliases.namesByLine[`${line}:${key}`];
  return aliases.names?.[key] ?? key;
}

export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const inSeoulBox = (p, box = SEOUL_BOX) => p.lat >= box.minLat && p.lat <= box.maxLat && p.lng >= box.minLng && p.lng <= box.maxLng;
const sortLines = (lines) => [...lines].sort((a, b) => {
  const ia = LINE_ORDER.indexOf(a), ib = LINE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});

// ---------- 역 (역사마스터) ----------

/**
 * 역사마스터 행 → 역 목록. 이름이 같고 SAME_STATION_KM 안이면 하나로 합친다(환승역). id = 'S' + 가장 작은 역사_ID.
 * 서울 여부: 서울 경계 사각형 안이고 aliases.outsideSeoul 에 없으면 서울.
 */
export function buildStations(masterRows, aliases, issues) {
  const excluded = (aliases.excludeStations ?? []).map((e) => `${matchKey(e.name)}|${e.line}`);
  const outside = new Set((aliases.outsideSeoul ?? []).map(matchKey));
  const rows = [];
  for (const r of masterRows) {
    const coarse = MASTER_ROUTE_LINES[r['호선']] ?? [lineOf(r['호선'])];
    if (coarse.some((l) => excluded.includes(`${matchKey(r['역사명'])}|${l}`))) continue;
    const name = canonicalName(r['역사명'], coarse, aliases);
    const p = { lat: Number(r['위도']), lng: Number(r['경도']) };
    rows.push({ code: r['역사_ID'], name, coarse, ...p, seoul: inSeoulBox(p) && !outside.has(matchKey(name)) });
  }
  // 이름별로 모으고, 같은 이름 안에서 가까운 것끼리 묶는다
  const byName = {};
  for (const r of rows) (byName[r.name] ??= []).push(r);
  const stations = [];
  for (const [name, group] of Object.entries(byName)) {
    const clusters = [];
    for (const r of group) {
      const c = clusters.find((cl) => cl.some((x) => distanceKm(x, r) <= SAME_STATION_KM));
      if (c) c.push(r); else clusters.push([r]);
    }
    if (clusters.length > 1) {
      const msg = `같은 이름 "${name}"인데 ${SAME_STATION_KM}km 넘게 떨어진 역이 ${clusters.length}곳 (aliases.json namesByLine 으로 이름을 나눠 주세요)`;
      if (clusters.some((cl) => cl.some((x) => x.seoul))) issues.push(msg); else issues.warn(msg);
    }
    clusters.forEach((cl, i) => {
      const first = [...cl].sort((a, b) => a.code.localeCompare(b.code))[0];
      const label = clusters.length > 1 && i > 0 ? `${name}(${lineName(first.coarse[0])})` : name;
      stations.push({ id: `S${first.code}`, name: label, lat: first.lat, lng: first.lng, seoul: cl.some((x) => x.seoul),
        codes: cl.map((x) => x.code), coarse: new Set(cl.flatMap((x) => x.coarse)) });
    });
  }
  return stations;
}

// 이름(+노선)으로 역 찾기. 이름이 같은 역이 여러 곳이면 그 노선이 지나는 역
function makeStationIndex(stations, aliases) {
  const byName = {}, byCode = {};
  for (const s of stations) {
    (byName[s.name] ??= []).push(s);
    for (const c of s.codes) byCode[c] = s;
  }
  const find = (raw, line) => {
    const lines = line ? [line] : [];
    const c = byName[canonicalName(raw, lines, aliases)] ?? [];
    if (c.length <= 1 || !line) return c.length === 1 ? c[0] : null;
    const withLine = c.filter((s) => s.coarse.has(line));
    return withLine.length === 1 ? withLine[0] : null;
  };
  const all = (raw) => byName[canonicalName(raw, [], aliases)] ?? [];
  return { find, all, byCode, byName };
}

// ---------- 그래프: 운행 구간 ----------

// 공식 역간 소요시간 CSV → 간선 (계통 OFFICIAL_ROUTES)
function officialEdges(distanceRows, index, aliases, issues) {
  const rowsByLine = {};
  for (const r of distanceRows) {
    (rowsByLine[r['호선']] ??= []).push({ name: canonicalName(r['역명'], [r['호선']], aliases), sec: toSeconds(r['소요시간']) });
  }
  const edges = [];
  for (const def of OFFICIAL_ROUTES) {
    const rows = rowsByLine[def.line];
    let cursor = 0;
    for (const sec of def.sections) {
      const i = rows.findIndex((r, k) => k >= cursor && r.name === sec.from);
      const j = rows.findIndex((r, k) => k > i && r.name === sec.to);
      if (i < 0 || j < 0) { issues.push(`공식 CSV ${def.line}호선에서 "${sec.from}~${sec.to}" 구간을 찾지 못함`); continue; }
      const seq = rows.slice(i, j + 1);
      if (sec.branchFrom) seq.unshift({ name: sec.branchFrom, sec: 0 });
      for (let k = 1; k < seq.length; k++) {
        const a = index.find(seq[k - 1].name, def.line), b = index.find(seq[k].name, def.line);
        if (!a || !b) { issues.push(`공식 CSV 역 이름 불일치: ${def.line}호선 ${!a ? seq[k - 1].name : seq[k].name}`); continue; }
        edges.push({ line: def.line, route: def.id, from: a.id, to: b.id, sec: seq[k].sec, source: 'official' });
        if (!sec.oneWay) edges.push({ line: def.line, route: def.id, from: b.id, to: a.id, sec: seq[k].sec, source: 'official' });
      }
      cursor = j;
    }
  }
  return edges;
}

// 시간표 구간표 → 간선 후보 (서울: 역코드, TAGO: 이름 + 노선)
function timetableEdges(seoul, tago, index, issues) {
  const out = [];
  for (const s of seoul.segments) {
    const a = index.byCode[s.fromCode], b = index.byCode[s.toCode];
    if (!a || !b || a === b) continue;
    out.push({ line: lineOf(s.line), kind: s.kind, from: a.id, to: b.id, sec: s.sec, source: 'seoul' });
  }
  const missing = new Set();
  for (const s of tago.segments) {
    const line = lineOf(s.line);
    const a = index.find(s.from, line), b = index.find(s.to, line);
    if (!a || !b) { missing.add(`${lineName(line)} ${!a ? s.from : s.to}`); continue; }
    if (a !== b) out.push({ line, kind: 'local', from: a.id, to: b.id, sec: s.sec, source: 'tago', mirror: s.method === 'mirror' });
  }
  for (const m of missing) issues.warn(`TAGO 시간표 역 이름을 역사마스터에서 찾지 못함: ${m}`);
  return out;
}

// 다른 구간들을 이어 같은 시간으로 갈 수 있는 구간 = 중간 역을 건너뛴 구간 (시간표의 중간 역 기록 빠짐 등)
export function findSkipped(edges, isCandidate) {
  const out = new Set();
  const byFrom = {};
  for (const e of edges) (byFrom[e.from] ??= []).push(e);
  for (const e of edges) {
    if (!isCandidate(e)) continue;
    const limit = e.sec * (1 + SKIP_TOLERANCE);
    const dist = { [e.from]: 0 };
    const hops = { [e.from]: 0 };
    const todo = new Set([e.from]);
    while (todo.size) {
      const u = [...todo].reduce((a, b) => (dist[a] <= dist[b] ? a : b));
      todo.delete(u);
      for (const v of byFrom[u] ?? []) {
        if (v === e) continue;
        const d = dist[u] + v.sec + (v.to === e.to ? 0 : 30);
        if (d <= limit && d < (dist[v.to] ?? Infinity)) { dist[v.to] = d; hops[v.to] = hops[u] + 1; todo.add(v.to); }
      }
    }
    if (dist[e.to] != null && hops[e.to] >= 2 && dist[e.to] >= e.sec * (1 - SKIP_TOLERANCE)) out.add(e);
  }
  return out;
}

// A → B 사이(두 역을 잇는 선 근처)에 같은 노선의 다른 역이 있으면 그 역을 돌려준다
//   A–C–B 직선거리 합이 A–B 의 BETWEEN_RATIO 배 안이면 "사이에 있다". 1km 미만인 짧은 구간은 보지 않는다
const BETWEEN_RATIO = 1.07; // 1.15 로 하면 1호선 광명 셔틀(금천구청→광명, 석수가 근처) 같은 진짜 지선까지 걸린다
export function betweenStation(e, stationIds, stationsById) {
  const a = stationsById[e.from], b = stationsById[e.to];
  const ab = distanceKm(a, b);
  if (ab < 1) return null;
  for (const id of stationIds ?? []) {
    if (id === e.from || id === e.to) continue;
    const c = stationsById[id];
    if (distanceKm(a, c) + distanceKm(c, b) <= ab * BETWEEN_RATIO) return c;
  }
  return null;
}

// 노선별 일반 구간: 공식 값이 덮는 역 사이는 공식 값만, 나머지는 서울 시간표 → TAGO 순서
// TAGO 는 열차번호가 없어 이웃이 아닌 역을 잇는 가짜 구간이 섞일 수 있어서, 공식·서울 시간표로 이미 이어진 역 사이의
// TAGO 구간과 직선거리로 시속 TAGO_MAX_KMH 를 넘는 TAGO 구간(GTX-A 제외)은 쓰지 않는다
const TAGO_MAX_KMH = 110;
function mergeLineEdges(official, timetable, stationsById, issues) {
  const officialStations = {};
  for (const e of official) for (const id of [e.from, e.to]) (officialStations[e.line] ??= new Set()).add(id);
  const best = new Map(); // "노선|from|to" → 간선
  for (const e of timetable.filter((x) => x.kind === 'local')) {
    if (OFFICIAL_ONLY_LINES.has(e.line)) continue;
    const cover = officialStations[e.line];
    if (cover?.has(e.from) && cover.has(e.to)) continue;
    const key = `${e.line}|${e.from}|${e.to}`;
    const prev = best.get(key);
    const rank = (x) => (x.source === 'seoul' ? 0 : x.mirror ? 2 : 1);
    if (!prev || rank(e) < rank(prev)) best.set(key, e);
  }
  const trusted = [...official, ...[...best.values()].filter((e) => e.source === 'seoul')];
  for (const [key, e] of best) {
    if (e.source !== 'tago') continue;
    const kmh = distanceKm(stationsById[e.from], stationsById[e.to]) / (e.sec / 3600);
    // ① 공식·서울 시간표로 이미 이어진 역 사이 → TAGO 구간은 필요 없다
    let drop = shortestSec(trusted.filter((x) => x.line === e.line), e.from, e.to) != null;
    // ② 너무 빠르면서 다른 역들을 거쳐 같은 두 역을 잇는 길이 따로 있으면 이웃이 아닌 역을 이은 가짜 지름길
    //    (시각이 1분 단위인 노선은 진짜 이웃 구간도 빠르게 보일 수 있어서, 대체 경로가 있을 때만 뺀다)
    if (!drop && e.line !== 'GTX-A' && kmh > TAGO_MAX_KMH) {
      const others = [...official, ...best.values()].filter((x) => x.line === e.line && x !== e && !(x.from === e.to && x.to === e.from));
      drop = shortestSec(others, e.from, e.to) != null;
    }
    if (drop) {
      best.delete(key);
      issues.note(`TAGO 구간을 쓰지 않음: ${e.line} ${stationsById[e.from].name}→${stationsById[e.to].name} ${e.sec}초 (${kmh.toFixed(0)}km/h)`);
    }
  }
  // ③ 두 역 사이에 같은 노선의 다른 역이 지리적으로 끼어 있으면 이웃이 아니다 (예: 경의중앙 왕십리↔효창공원앞 사이의 옥수·한남·용산)
  const lineStations = {};
  for (const e of [...official, ...best.values()]) for (const id of [e.from, e.to]) (lineStations[e.line] ??= new Set()).add(id);
  for (const [key, e] of best) {
    const between = betweenStation(e, lineStations[e.line], stationsById);
    if (between) {
      best.delete(key);
      issues.note(`이웃이 아닌 역을 잇는 구간이라 뺌: ${e.line} ${stationsById[e.from].name}→${stationsById[e.to].name} (사이에 ${between.name}) (${e.source})`);
    }
  }
  const all = [...official, ...best.values()];
  // 노선마다 따로 본다 (다른 노선을 거치는 길은 그 노선 열차로 갈 수 있는 길이 아니다)
  const skipped = new Set();
  for (const line of new Set(all.map((e) => e.line))) {
    for (const e of findSkipped(all.filter((x) => x.line === line), (x) => x.source !== 'official')) skipped.add(e);
  }
  for (const e of skipped) issues.note(`역을 건너뛴 구간으로 보고 뺌: ${e.line} ${e.from}→${e.to} (${e.source})`);
  return all.filter((e) => !skipped.has(e));
}

// 계통 나누기: 같은 노선을 갈림 역에서 나눈다 (그래프에서 각 방향의 역을 찾는다)
function reachableWithout(edges, start, blocked) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    for (const e of edges) {
      for (const [x, y] of [[e.from, e.to], [e.to, e.from]]) {
        if (x === u && y !== blocked && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
  }
  return seen;
}

// 구간 목록에서 from → to 가장 짧은 시간 (중간 역 정차 30초 포함). 길이 없으면 null
function shortestSec(edges, from, to) {
  const dist = { [from]: 0 };
  const todo = new Set([from]);
  while (todo.size) {
    const u = [...todo].reduce((a, b) => (dist[a] <= dist[b] ? a : b));
    todo.delete(u);
    if (u === to) return dist[u];
    for (const e of edges) {
      if (e.from !== u) continue;
      const d = dist[u] + e.sec + (e.to === to ? 0 : 30);
      if (d < (dist[e.to] ?? Infinity)) { dist[e.to] = d; todo.add(e.to); }
    }
  }
  return null;
}

/** 일반 구간 → 계통별 간선. @returns {{routes: Array, rides: Array<{route, from, to, sec, estimated}>}} */
function buildRoutes(localEdges, expressEdges, index, issues) {
  const routes = [], rides = [];
  const byLine = {};
  for (const e of localEdges) (byLine[e.line] ??= []).push(e);
  const idOf = (name, line) => index.find(name, line)?.id;

  for (const line of sortLines(Object.keys(byLine))) {
    const edges = byLine[line];
    const est = (e) => (e.source === 'official' ? {} : { estimated: true });
    if (OFFICIAL_ONLY_LINES.has(line)) { // 공식 계통 그대로 (2호선 지선, 5호선 분기, 6호선 순환)
      for (const def of OFFICIAL_ROUTES.filter((d) => d.line === line)) {
        routes.push({ id: def.id, line, name: def.name ?? lineName(line), express: false });
        for (const e of edges.filter((x) => x.route === def.id)) rides.push({ route: def.id, from: e.from, to: e.to, sec: e.sec, ...est(e) });
      }
      continue;
    }
    const members = new Map(); // 계통 id → 역 id 집합 (null 이면 노선 전체)
    const all = new Set(edges.flatMap((e) => [e.from, e.to]));
    const split = SPLITS[line];
    if (split) {
      const at = idOf(split.at, line);
      const sides = split.branches.map((b) => reachableWithout(edges, idOf(b.first, line), at));
      split.branches.forEach((b, i) => {
        const other = sides[1 - i];
        members.set(b.id, new Set([...all].filter((id) => !other.has(id))));
        routes.push({ id: b.id, line, name: b.name, express: false });
      });
    } else {
      const only = new Set(); // 지선에만 있는 역 (지선의 마지막 역은 갈아타는 역이라 본선에도 둔다)
      for (const branch of BRANCH_ROUTES[line] ?? []) {
        const ids = branch.stations.map((n) => idOf(n, line));
        members.set(branch.id, new Set(ids));
        routes.push({ id: branch.id, line, name: branch.name, express: false });
        for (const id of ids.slice(0, -1)) only.add(id);
      }
      members.set(line, new Set([...all].filter((id) => !only.has(id))));
      routes.push({ id: line, line, name: lineName(line), express: false });
    }
    for (const [routeId, set] of members) {
      for (const e of edges) if (set.has(e.from) && set.has(e.to)) rides.push({ route: routeId, from: e.from, to: e.to, sec: e.sec, ...est(e) });
    }
    // 급행: 같은 갈래(계통) 안의 급행 구간만, 일반 열차로 그 사이를 가는 길이 있고 급행이 그보다 느리지 않을 때만 쓴다
    if (EXPRESS_LINES.has(line)) {
      const exp = expressEdges.filter((e) => e.line === line);
      for (const [routeId, set] of members) {
        const localHere = edges.filter((e) => set.has(e.from) && set.has(e.to));
        const ok = exp.filter((e) => {
          if (!set.has(e.from) || !set.has(e.to)) return false;
          const t = shortestSec(localHere, e.from, e.to);
          if (t == null || e.sec > t + 60) { issues.note(`급행 구간으로 쓰지 않음: ${e.from}→${e.to} (일반 ${t ?? '경로 없음'}초, 급행 ${e.sec}초)`); return false; }
          return true;
        });
        if (!ok.length) continue;
        const expId = `${routeId}-express`;
        routes.push({ id: expId, line, name: `${routes.find((r) => r.id === routeId).name} 급행`, express: true });
        for (const e of ok) rides.push({ route: expId, from: e.from, to: e.to, sec: e.sec, estimated: true });
      }
    }
  }
  // 9호선처럼 계통 이름이 노선과 같으면 "9호선 급행"
  for (const r of routes) if (r.express) r.name = r.name.replace(/^(.+) 급행$/, '$1 급행');
  return { routes, rides };
}

// ---------- 그래프: 환승 ----------

// 환승정보(호차·문 위치별) 줄 → (역, 출발 노선, 갈아탈 노선) 방면별 평균
function doorTransferRows(rows, index, rides, routeLine, issues) {
  const linesBetween = {}; // "역id|다음 역id" → 노선들
  for (const r of rides) (linesBetween[`${r.from}|${r.to}`] ??= new Set()).add(routeLine[r.route]);
  const times = {};
  for (const r of rows) {
    const line = lineOf(r['환승시작 호선']);
    const station = index.find(r['환승시작역'], line);
    if (!station) { issues.warn(`환승정보 역 이름을 찾지 못함: ${r['환승시작역']} (${r['환승시작 호선']})`); continue; }
    const code = r['환승종료역'];
    let toLine = /^\d{4}$/.test(code) ? CODE_LINES[code.slice(0, 2)] : undefined;
    if (!toLine) { // 코레일 역코드: 환승역 → 방면 역으로 바로 이어지는 다른 노선
      const towardName = r['환승 열차 방면'].replace(/\s*방면$/, '');
      const found = new Set();
      for (const t of index.all(towardName)) {
        for (const l of linesBetween[`${station.id}|${t.id}`] ?? []) if (l !== line) found.add(l);
      }
      if (found.size === 1) toLine = [...found][0];
    }
    if (!toLine || !r['소요시간']) continue;
    (times[`${station.id}|${line}|${toLine}`] ??= []).push(toSeconds(r['소요시간']));
  }
  return Object.entries(times).map(([key, secs]) => {
    const [station, line, toLine] = key.split('|');
    return { station, line, toLine, walkSec: Math.round(secs.reduce((a, b) => a + b, 0) / secs.length), source: '환승정보' };
  });
}

function csvTransferRows(rows, index, issues) {
  const out = [];
  for (const r of rows) {
    const line = lineOf(r['호선']), toLine = lineOf(r['환승노선']);
    const station = index.find(r['환승역명'], line);
    if (!station) { issues.warn(`환승역 거리 CSV 역 이름을 찾지 못함: ${r['환승역명']}`); continue; }
    out.push({ station: station.id, line, toLine, walkSec: toSeconds(r['환승소요시간']), source: '환승역거리' });
  }
  return out;
}

/** 노선 단위 환승 값 → 계통 단위 환승 간선 (+ 반대 방향 채우기, 급행 갈아타기, 가정값) */
function buildTransfers({ doorRows, csvRows, routes, rides, stationsById, issues }) {
  const routeLine = Object.fromEntries(routes.map((r) => [r.id, r.line]));
  const express = new Set(routes.filter((r) => r.express).map((r) => r.id));
  const routesAt = {}; // 역 id → 계통들
  for (const r of rides) for (const id of [r.from, r.to]) (routesAt[id] ??= new Set()).add(r.route);
  const key = (r) => `${r.station}|${r.line}|${r.toLine}`;
  const have = new Set(doorRows.map(key));
  const lineRows = [...doorRows, ...csvRows.filter((r) => !have.has(key(r)))];

  const edges = new Map(); // "역|a|b" → 간선
  const put = (station, a, b, minutes, extra = {}) => {
    const k = `${station}|${a}|${b}`;
    if (!edges.has(k)) edges.set(k, { from: `${station}:${a}`, to: `${station}:${b}`, minutes, type: 'transfer', ...extra });
  };
  for (const r of lineRows) {
    const here = [...(routesAt[r.station] ?? [])];
    for (const a of here.filter((x) => routeLine[x] === r.line && !express.has(x))) {
      for (const b of here.filter((x) => routeLine[x] === r.toLine && x !== a)) {
        if (routeLine[a] === routeLine[b] && (express.has(b) || express.has(a))) continue; // 급행↔일반은 swap
        put(r.station, a, b, toMinutes(r.walkSec));
        if (express.has(b)) continue;
      }
    }
    // 급행 계통에서 내려 갈아타는 경우도 같은 값 (같은 역 같은 승강장에서 내린다)
    for (const a of here.filter((x) => routeLine[x] === r.line && express.has(x))) {
      for (const b of here.filter((x) => routeLine[x] === r.toLine && routeLine[x] !== r.line)) put(r.station, a, b, toMinutes(r.walkSec));
    }
  }
  // 반대 방향 값으로 채우기 (한쪽 방향만 자료가 있는 환승)
  for (const e of [...edges.values()]) {
    const [st, a] = e.from.split(':'), b = e.to.split(':')[1];
    put(st, b, a, e.minutes, { filled: 'reverse' });
  }
  // 급행 ↔ 일반 갈아타기 (같은 승강장, 환승 횟수에 세지 않음)
  for (const [st, set] of Object.entries(routesAt)) {
    for (const ex of [...set].filter((x) => express.has(x))) {
      const base = ex.replace(/-express$/, '');
      if (set.has(base)) { put(st, base, ex, 0, {}); put(st, ex, base, 0, {}); edges.get(`${st}|${base}|${ex}`).type = 'swap'; edges.get(`${st}|${ex}|${base}`).type = 'swap'; }
    }
  }
  // 가정값 (공식 자료 없음)
  const nameOf = (id) => stationsById[id]?.name ?? id;
  for (const a of ASSUMED_TRANSFERS) {
    const st = Object.keys(routesAt).find((id) => nameOf(id) === a.station && a.routes.every((r) => routesAt[id].has(r)));
    if (!st) { issues.push(`가정 환승을 넣을 역·계통을 찾지 못함: ${a.station} ${a.routes.join('↔')}`); continue; }
    const [x, y] = a.routes;
    put(st, x, y, a.walkMinutes, { assumed: true }); put(st, y, x, a.walkMinutes, { assumed: true });
  }
  // 꼭 있어야 하는 환승: 다른 노선끼리 + 지선 갈림 역. 서울 역에서 빠지면 검사 결과, 서울 밖이면 기본값으로 채우고 경고
  const pairsNeeded = [];
  for (const [st, set] of Object.entries(routesAt)) {
    const list = [...set].filter((x) => !express.has(x));
    for (const a of list) for (const b of list) if (a !== b && routeLine[a] !== routeLine[b]) pairsNeeded.push([st, a, b]);
  }
  for (const [name, a, b] of BRANCH_TRANSFERS) {
    const st = Object.keys(routesAt).find((id) => nameOf(id) === name && routesAt[id].has(a) && routesAt[id].has(b));
    if (st) pairsNeeded.push([st, a, b], [st, b, a]);
  }
  // 공식 자료가 없는 환승은 추정한다 (assumed: true):
  //   같은 역에서 갈아탈 노선으로 가는 공식 환승값의 평균 → 없으면 같은 역에서 출발 노선에서 나가는 공식 환승값의 평균 → 없으면 기본값
  //   (예: 서울역 경의중앙→공항철도 = 서울역 1·4호선→공항철도 공식값의 평균. 공항철도 승강장이 깊고 멀어서 이렇게 보는 편이 기본값보다 낫다)
  const officialHere = (st) => [...edges.values()].filter((e) => e.type === 'transfer' && !e.assumed && e.from.startsWith(`${st}:`));
  const estimated = { seoul: [], other: [] };
  for (const [st, a, b] of pairsNeeded) {
    if (edges.has(`${st}|${a}|${b}`)) continue;
    const here = officialHere(st);
    const into = here.filter((e) => routeLine[e.to.split(':')[1]] === routeLine[b]);
    const outOf = here.filter((e) => routeLine[e.from.split(':')[1]] === routeLine[a]);
    const basis = into.length ? into : outOf;
    const minutes = basis.length ? Math.round((basis.reduce((s, e) => s + e.minutes, 0) / basis.length) * 100) / 100 : toMinutes(DEFAULT_WALK_SEC);
    put(st, a, b, minutes, { assumed: true });
    const how = into.length ? '같은 역에서 그 노선으로 가는 공식값 평균' : outOf.length ? '같은 역에서 그 노선에서 나가는 공식값 평균' : '기본값';
    (stationsById[st]?.seoul ? estimated.seoul : estimated.other).push(`${nameOf(st)} ${a}→${b} ${minutes}분(${how})`);
  }
  if (estimated.seoul.length) issues.warn(`서울 역 환승 ${estimated.seoul.length}건은 공식 자료가 없어 추정: ${estimated.seoul.join(', ')}`);
  if (estimated.other.length) issues.warn(`서울 밖 환승 ${estimated.other.length}건은 공식 자료가 없어 추정 (예: ${estimated.other.slice(0, 8).join(', ')}${estimated.other.length > 8 ? ' …' : ''})`);
  return [...edges.values()];
}

// ---------- 검사 ----------

function checkConnectivity(stations, edges, issues) {
  const station = (node) => node.split(':')[0];
  const out = {}, inn = {};
  for (const e of edges) {
    (out[station(e.from)] ??= new Set()).add(station(e.to));
    (inn[station(e.to)] ??= new Set()).add(station(e.from));
  }
  // 정류장 단위로 묶어 본다 (같은 역의 노드끼리는 환승 간선으로 이어져 있다)
  const nodes = new Set(edges.flatMap((e) => [station(e.from), station(e.to)]));
  const hub = stations.find((s) => s.name === '서울')?.id;
  const reach = (adj) => { const seen = new Set([hub]), stack = [hub]; while (stack.length) for (const n of adj[stack.pop()] ?? []) if (!seen.has(n)) { seen.add(n); stack.push(n); } return seen; };
  const fwd = reach(out), back = reach(inn);
  for (const s of stations) {
    const problem = !nodes.has(s.id) ? '그래프에 없는 역' : !(fwd.has(s.id) && back.has(s.id)) ? '그래프에 연결되지 않은 역' : null;
    if (!problem) continue;
    // 서울 역은 꼭 이어져야 한다. 수도권 끝의 일부 역은 시간표 자료가 없어서, 출발역으로 고르면 직선거리 예상 시간으로 대체된다
    if (s.seoul) issues.push(`${problem}: ${s.name}`); else issues.warn(`${problem}(시간표 자료 없음 → 직선거리 예상으로 대체): ${s.name}`);
  }
}

function checkSpeeds(rides, stationsById, issues) {
  const odd = [];
  for (const r of rides) {
    const a = stationsById[r.from], b = stationsById[r.to];
    const kmh = distanceKm(a, b) / (r.sec / 3600);
    if (kmh > 130 || kmh < 8) odd.push(`${a.name}→${b.name}(${r.route}) ${r.sec}초 ${kmh.toFixed(0)}km/h`);
  }
  if (odd.length) issues.warn(`속도가 이상해 보이는 구간 ${odd.length}개 (직선거리 기준): ${odd.slice(0, 10).join(', ')}${odd.length > 10 ? ' …' : ''}`);
}

// ---------- 콘텐츠팀 시트 ----------

function sheetStations(rows, index, issues) {
  const bySlug = {};
  for (const r of rows) {
    const lines = (r['호선'] ?? '').split(/[·,\s]+/).filter(Boolean).map(lineOf);
    let s = index.find(r['역 이름']);
    if (!s) s = lines.map((l) => index.find(r['역 이름'], l)).find(Boolean) ?? null;
    if (!s) { issues.push(`역 이름 불일치(후보 역 시트): ${r['역 이름']} (${r.id})`); continue; }
    bySlug[r.id] = s;
  }
  return bySlug;
}

function buildCandidates(categoryRows, bySlug, issues) {
  const out = { 회식: [], 회의: [], 오락: [] };
  for (const r of categoryRows) {
    const s = bySlug[r['역 id']];
    if (!s) { issues.push(`카테고리 탭의 역 id가 역 탭에 없음: ${r['역 id']}`); continue; }
    for (const [col, purpose] of Object.entries(PURPOSES)) if (/^o$/i.test(r[col] ?? '')) out[purpose].push(s.id);
  }
  for (const [purpose, ids] of Object.entries(out)) if (ids.length < MIN_CANDIDATES) issues.push(`목적별 후보 ${MIN_CANDIDATES}곳 미만: ${purpose} ${ids.length}곳`);
  return out;
}

const PLACE_DETAIL_COLUMNS = ['룸 여부', '최대 인원', '1인 예산', '단체 예약 가능', '좌석 규모', '콘센트', '조용함', '영업 종료 시간', '예약 필요 여부'];
function buildPlaces(rows, bySlug, issues) {
  if (!rows.length) { issues.push('장소 탭이 아직 비어 있음 (places.json 은 빈 목록)'); return []; }
  const order = {};
  const out = [];
  for (const r of rows) {
    const s = bySlug[r['역 id']], purpose = PURPOSES[r['모임 종류']];
    if (!s) { issues.push(`장소의 역 id가 역 탭에 없음: ${r['역 id']} (${r['가게 이름']})`); continue; }
    if (!purpose) { issues.push(`장소의 모임 종류가 이상함: ${r['모임 종류']} (${r['가게 이름']})`); continue; }
    if (!r['가게 이름']) { issues.push(`장소 가게 이름 빈 칸: ${r['역 id']} ${r['모임 종류']}`); continue; }
    const link = r['지도 링크'];
    if (!link) issues.push(`장소 링크 없음: ${r['가게 이름']}`);
    const n = (order[`${s.id}|${purpose}`] = (order[`${s.id}|${purpose}`] ?? 0) + 1);
    out.push({
      place_id: `P-${s.id}-${purpose}-${n}`, station_id: s.id, purpose, order: n, name: r['가게 이름'],
      category: r['시설 종류'] ?? '', reason: r['한 줄 추천 이유'] ?? '',
      kakao_url: /naver/.test(link) ? '' : link, naver_url: /naver/.test(link) ? link : '',
      checked_at: r['확인일'] ?? '',
      detail: Object.fromEntries(PLACE_DETAIL_COLUMNS.filter((c) => r[c]).map((c) => [c, r[c]])),
    });
  }
  return out;
}

// ---------- 출처 ----------

const SOURCES = [
  { name: '서울시 역사마스터 정보', provider: '서울 열린데이터광장 OA-21232 (API subwayStationMaster)', file: 'scripts/input/station_master.csv', license: '공공누리 제1유형(출처표시)' },
  { name: '서울교통공사 역간거리 및 소요시간', provider: '서울 열린데이터광장 OA-12034 (2024.8.10판)', file: 'scripts/input/station_distance.csv', license: '공공누리 제1유형(출처표시)', use: '공식 운행시간 (1~8호선 공사 구간)' },
  { name: '서울교통공사 서울 도시철도 환승정보', provider: '공공데이터포털 15098252 (2026.9.1판)', file: 'scripts/input/transfer_door_time.csv', license: '이용허락범위 제한 없음', use: '환승 도보시간 기준 (방면별 평균)' },
  { name: '서울교통공사 환승역거리 소요시간 정보', provider: '공공데이터포털 15044419 (2025.12.31판)', file: 'scripts/input/transfer_time.csv', license: '이용허락범위 제한 없음', use: '위 환승정보에 없는 환승 (최단환승거리 ÷ 1.2m/s)' },
  { name: '서울교통공사 역코드로 지하철 열차 시간표 검색', provider: '서울 열린데이터광장 (SearchSTNTimeTableByIDService)', file: 'scripts/input/timetable-seoul.json', license: '공공누리 제1유형(출처표시)', use: '공식 값이 없는 구간의 추정 운행시간 (열차번호 기반, 급행 구분)' },
  { name: '국토교통부 TAGO 지하철정보', provider: '공공데이터포털 15098554 (GetSubwaySttnAcctoSchdulList)', file: 'scripts/input/timetable-tago.json', license: '이용허락범위 제한 없음', use: '서울 시간표에 없는 노선의 추정 운행시간' },
  { name: '콘텐츠팀 시트 (초안)', provider: '모이자_역_카테고리_초안.xlsx 의 역·카테고리·장소 탭', file: 'scripts/input/sheet-*.csv', license: '팀 자료' },
];

// ---------- 전체 ----------

function makeIssues() {
  const list = [], warnings = [], notes = [];
  return Object.assign(list, { push: (m) => Array.prototype.push.call(list, m), warn: (m) => warnings.push(m), note: (m) => notes.push(m), warnings, notes });
}

export function convert() {
  const issues = makeIssues();
  const aliases = readJson(join(ROOT, 'scripts', 'aliases.json'));
  const stations = buildStations(readTable('station_master.csv'), aliases, issues);
  const index = makeStationIndex(stations, aliases);
  const stationsById = Object.fromEntries(stations.map((s) => [s.id, s]));

  const official = officialEdges(readTable('station_distance.csv'), index, aliases, issues);
  const timetable = timetableEdges(readJson(join(INPUT, 'timetable-seoul.json')), readJson(join(INPUT, 'timetable-tago.json')), index, issues);
  const local = mergeLineEdges(official, timetable, stationsById, issues);
  const { routes, rides } = buildRoutes(local, timetable.filter((e) => e.kind === 'express'), index, issues);
  const routeLine = Object.fromEntries(routes.map((r) => [r.id, r.line]));
  const transfers = buildTransfers({
    doorRows: doorTransferRows(readTable('transfer_door_time.csv'), index, rides, routeLine, issues),
    csvRows: csvTransferRows(readTable('transfer_time.csv'), index, issues),
    routes, rides, stationsById, issues,
  });
  checkSpeeds(rides, stationsById, issues);

  const rideEdges = rides.map((r) => ({ from: `${r.from}:${r.route}`, to: `${r.to}:${r.route}`, minutes: toMinutes(r.sec), type: 'ride', ...(r.estimated ? { estimated: true } : {}) }));
  const edges = [...rideEdges, ...transfers].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.type.localeCompare(b.type));
  checkConnectivity(stations, edges, issues);

  // 역 목록: 운행 노선은 그래프에서, 그래프에 없는 역은 역사마스터의 노선
  const linesAt = {};
  for (const r of rides) for (const id of [r.from, r.to]) (linesAt[id] ??= new Set()).add(routeLine[r.route]);
  // 열차가 하루 몇 번만 다니는 역은 trains_per_day 를 적는다 (화면이 실제 운행 시각을 확인하라고 경고한다)
  const rare = Object.fromEntries((aliases.rareService ?? []).map((r) => [canonicalName(r.name, [], aliases), r.trainsPerDay]));
  for (const name of Object.keys(rare)) if (!stations.some((s) => s.name === name)) issues.push(`운행이 드문 역 이름을 찾지 못함(aliases.json rareService): ${name}`);
  const stationList = stations
    .map((s) => ({
      id: s.id, name: s.name, lines: sortLines(linesAt[s.id] ?? s.coarse), lat: s.lat, lng: s.lng, seoul: s.seoul,
      ...(rare[s.name] ? { trains_per_day: rare[s.name] } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id));

  // 콘텐츠팀 시트
  const bySlug = sheetStations(readTable('sheet-stations.csv'), index, issues);
  const candidates = buildCandidates(readTable('sheet-categories.csv'), bySlug, issues);
  const connected = new Set(edges.map((e) => e.from.split(':')[0]));
  for (const id of new Set(Object.values(candidates).flat())) if (!connected.has(id)) issues.push(`그래프에 연결되지 않은 후보 역: ${stationsById[id].name}`);
  const places = buildPlaces(readTable('sheet-places.csv'), bySlug, issues);
  const demoFile = join(INPUT, 'sheet-demo.csv');
  if (!existsSync(demoFile)) issues.push('시연 시나리오 시트가 아직 없음 (demo.json 은 빈 목록)');

  const graph = {
    meta: {
      generated_by: 'node scripts/convert.js',
      sources: SOURCES,
      principle: '서울교통공사 공식 값이 있으면 그대로 쓰고, 공식 값이 없는 구간만 실제 열차 시간표로 계산한 추정값을 쓴다 (estimated: true). 가상 데이터가 아니다.',
      format: {
        node: '"역id:계통id"',
        routes: '계통 목록. 계통 = 갈아타지 않고 쭉 갈 수 있는 열차 노선 단위 (express: true 는 급행)',
        ride: '같은 계통 인접 역 운행시간(분). estimated: true 는 시간표 추정값',
        transfer: '같은 역 다른 계통 사이 환승 도보시간(분, 대기 시간 미포함). filled: "reverse" 는 반대 방향 값, assumed: true 는 공식 자료가 없어 정한 값',
        swap: '같은 노선 급행↔일반 갈아타기 (도보 0분, 환승 횟수에 세지 않음)',
      },
      counts: { stations: stationList.length, seoul: stationList.filter((s) => s.seoul).length, routes: routes.length,
        ride: rideEdges.length, estimated: rideEdges.filter((e) => e.estimated).length, transfer: transfers.filter((t) => t.type === 'transfer').length,
        swap: transfers.filter((t) => t.type === 'swap').length },
    },
    routes,
    edges,
  };
  const demo = { meta: { generated_by: 'node scripts/convert.js', sources: SOURCES.slice(-1) }, scenarios: [] };
  return { stations: stationList, graph, candidates, places, demo, issues };
}

// 사람이 읽기 쉽고 실행할 때마다 같은 결과가 나오도록, 배열 원소는 한 줄에 하나씩 쓴다
export function formatJson(value) {
  const line = (v) => JSON.stringify(v);
  if (Array.isArray(value)) return value.length ? `[\n${value.map((v) => `  ${line(v)}`).join(',\n')}\n]\n` : '[]\n';
  const parts = Object.entries(value).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return `  ${line(k)}: [\n${v.map((x) => `    ${line(x)}`).join(',\n')}\n  ]`;
    return `  ${line(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`;
  });
  return `{\n${parts.join(',\n')}\n}\n`;
}

function main() {
  const { stations, graph, candidates, places, demo, issues } = convert();
  writeFileSync(join(DATA, 'stations.json'), formatJson(stations));
  writeFileSync(join(DATA, 'transit-graph.json'), formatJson(graph));
  writeFileSync(join(DATA, 'candidates.json'), formatJson(candidates));
  writeFileSync(join(DATA, 'places.json'), formatJson(places));
  writeFileSync(join(DATA, 'demo.json'), formatJson(demo));
  const c = graph.meta.counts;
  console.log(`✔ data/*.json 5개를 만들었어요`);
  console.log(`  역 ${c.stations}개(서울 ${c.seoul}개), 계통 ${c.routes}개, 운행 구간 ${c.ride}개(시간표 추정 ${c.estimated}개), 환승 ${c.transfer}개, 급행 갈아타기 ${c.swap}개`);
  console.log(`  후보 역: 회식 ${candidates.회식.length} · 회의 ${candidates.회의.length} · 오락 ${candidates.오락.length}, 장소 ${places.length}곳`);
  if (issues.warnings.length) { console.log(`\n참고 ${issues.warnings.length}건 (서울 밖 등, 종료 코드에는 영향 없음)`); for (const w of issues.warnings) console.log(`  - ${w}`); }
  if (issues.length) {
    console.log(`\n✖ 검사 결과 ${issues.length}건`);
    for (const m of issues) console.log(`  - ${m}`);
    process.exitCode = 1;
  } else console.log('\n검사 결과 0건');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
