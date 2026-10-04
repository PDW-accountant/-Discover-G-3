import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convert, formatJson, decodeText, parseCsv, matchKey, canonicalName, buildStations, findSkipped, betweenStation, lineOf,
} from '../scripts/convert.js';

// 실행: npm test   (FUNC-016 #14 데이터 변환)

const ALIASES = {
  names: { 당고개: '불암산', 총신대입구: '총신대입구(이수)', 이수: '총신대입구(이수)' },
  namesByLine: { '경의중앙:신촌': '신촌(경의중앙)' },
  outsideSeoul: ['지축'],
  excludeStations: [],
};
const issues = () => Object.assign([], { warn() {}, note() {} });

// ---------- 부품 ----------

test('FUNC-016: CSV 인코딩이 EUC-KR이면 자동으로 바꿔 읽는다', () => {
  const euckr = Uint8Array.from([0xbc, 0xad, 0xbf, 0xef]); // "서울" (EUC-KR)
  assert.equal(decodeText(euckr), '서울');
  assert.equal(decodeText(new TextEncoder().encode('﻿서울')), '서울');
});

test('FUNC-016: CSV 따옴표 안의 쉼표와 "" 를 처리한다', () => {
  assert.deepEqual(parseCsv('a,b\n"1,2","x""y"\n\n'), [['a', 'b'], ['1,2', 'x"y']]);
});

test("FUNC-016: 역 이름 정규화 — 끝의 '역', 괄호, 공백을 떼고 aliases 로 공식 이름을 쓴다", () => {
  assert.equal(matchKey('종로3가역'), '종로3가');
  assert.equal(matchKey('서울대입구(관악구청)'), '서울대입구');
  assert.equal(canonicalName('시청역', [], ALIASES), '시청');
  assert.equal(canonicalName('서울역', [], ALIASES), '서울', '화면이 "{name}역"으로 붙이므로 서울역도 "서울"');
  assert.equal(canonicalName('서울', ['GTX-A'], ALIASES), '서울');
  assert.equal(canonicalName('당고개', ['4'], ALIASES), '불암산');
  assert.equal(canonicalName('이수', ['7'], ALIASES), '총신대입구(이수)');
  assert.equal(canonicalName('신촌', ['경의중앙'], ALIASES), '신촌(경의중앙)');
  assert.equal(canonicalName('신촌', ['2'], ALIASES), '신촌');
});

test('FUNC-016: 노선 표기를 통일한다', () => {
  assert.equal(lineOf('01호선'), '1');
  assert.equal(lineOf('4호선'), '4');
  assert.equal(lineOf('경의선'), '경의중앙');
  assert.equal(lineOf('공항'), '공항철도');
  assert.equal(lineOf('우이신설경전철'), '우이신설');
});

test('FUNC-016: 같은 이름·가까운 역은 하나로 합치고 id는 S + 가장 작은 역사_ID, 서울 밖은 seoul=false', () => {
  const row = (id, name, line, lat, lng) => ({ 역사_ID: id, 역사명: name, 호선: line, 위도: String(lat), 경도: String(lng) });
  const stations = buildStations([
    row('0426', '서울역', '4호선', 37.5532, 126.9725), row('0150', '서울역', '1호선', 37.5562, 126.9721),
    row('0240', '신촌', '2호선', 37.5551, 126.9369), row('1252', '신촌', '경의중앙선', 37.5597, 126.9426),
    row('0309', '지축', '3호선', 37.6481, 126.9137),
  ], ALIASES, issues());
  const byName = Object.fromEntries(stations.map((s) => [s.name, s]));
  assert.equal(byName['서울'].id, 'S0150');
  assert.deepEqual([...byName['서울'].coarse].sort(), ['1', '4']);
  assert.ok(byName['신촌'] && byName['신촌(경의중앙)'], '2호선 신촌과 경의중앙선 신촌은 다른 역');
  assert.equal(byName['서울'].seoul, true);
  assert.equal(byName['지축'].seoul, false);
});

test('FUNC-016: 다른 구간들을 이어 같은 시간으로 갈 수 있는 구간은 역을 건너뛴 구간이다', () => {
  const e = (from, to, sec, source = 'seoul') => ({ from, to, sec, source });
  const edges = [e('A', 'B', 100), e('B', 'C', 100), e('A', 'C', 230), e('C', 'D', 100, 'official')];
  assert.deepEqual([...findSkipped(edges, (x) => x.source !== 'official')].map((x) => x.from + x.to), ['AC']);
});

test('FUNC-016: 두 역 사이에 같은 노선의 다른 역이 끼어 있으면 이웃이 아니다', () => {
  const s = (id, lat, lng) => ({ id, name: id, lat, lng });
  const byId = { A: s('A', 37.50, 127.00), B: s('B', 37.50, 127.03), C: s('C', 37.50, 127.06), D: s('D', 37.55, 127.03) };
  assert.equal(betweenStation({ from: 'A', to: 'C' }, ['A', 'B', 'C', 'D'], byId)?.id, 'B');
  assert.equal(betweenStation({ from: 'A', to: 'B' }, ['A', 'B', 'C', 'D'], byId), null);
});

// ---------- 실제 변환 결과 ----------

const result = convert();
const { stations, graph, candidates } = result;
const byName = (n) => stations.find((s) => s.name === n);
const node = (name, route) => `${byName(name).id}:${route}`;
const edge = (from, to) => graph.edges.find((e) => e.from === from && e.to === to);

test('FUNC-016: 검사 결과가 0건이다 (역 이름 불일치·빈 칸·후보 8곳 미만·장소 링크 없음·그래프 연결 모두 통과)', () => {
  assert.deepEqual([...result.issues], []);
});

test('FUNC-016: 장소 탭을 places.json으로 바꾼다 (역·목적별 순서, 카카오맵 링크)', () => {
  assert.equal(result.places.length, 126);
  const first = result.places.find((p) => p.station_id === byName('종로3가').id && p.purpose === '회식' && p.order === 1);
  assert.equal(first.name, '시민식당 본점');
  assert.ok(result.places.every((p) => p.kakao_url.startsWith('https://') && p.reason));
});

test('FUNC-016: 서울 안 역은 모두 그래프로 이어진다 (직선거리 대체가 필요 없다)', () => {
  const inGraph = new Set(graph.edges.flatMap((e) => [e.from.split(':')[0], e.to.split(':')[0]]));
  const missing = stations.filter((s) => s.seoul && !inGraph.has(s.id)).map((s) => s.name);
  assert.deepEqual(missing, []);
  assert.ok(stations.filter((s) => s.seoul).length > 300);
});

test('FUNC-016: 공식 값이 있으면 그대로, 없는 구간만 시간표 추정값(estimated)', () => {
  assert.deepEqual(edge(node('시청', '1-incheon'), node('종각', '1-incheon')), { from: node('시청', '1-incheon'), to: node('종각', '1-incheon'), minutes: 2, type: 'ride' });
  assert.equal(edge(node('남영', '1-incheon'), node('용산', '1-incheon')).estimated, true);
  const nine = graph.edges.filter((e) => e.type === 'ride' && /:9(-express)?$/.test(e.from));
  assert.ok(nine.length > 70 && nine.every((e) => e.estimated));
});

test('FUNC-016: 9호선 급행은 일반과 다른 계통이고, 급행↔일반 갈아타기는 swap(도보 0분)', () => {
  assert.ok(graph.routes.some((r) => r.id === '9-express' && r.express));
  assert.deepEqual(edge(node('노량진', '9'), node('노량진', '9-express')), { from: node('노량진', '9'), to: node('노량진', '9-express'), minutes: 0, type: 'swap' });
  assert.equal(edge(node('샛강', '9'), node('샛강', '9-express')), undefined, '샛강은 급행이 서지 않는다');
});

test('FUNC-016: 환승 도보시간은 서울 도시철도 환승정보의 방면별 평균 (시청 1→2호선 182초)', () => {
  assert.equal(edge(node('시청', '1-incheon'), node('시청', '2-main')).minutes, 3.03);
});

test('FUNC-016: 1호선은 구로에서 인천 방면과 천안 방면으로 갈라진다', () => {
  assert.ok(edge(node('구로', '1-incheon'), node('구일', '1-incheon')));
  assert.equal(edge(node('구로', '1-incheon'), node('가산디지털단지', '1-incheon')), undefined);
  assert.ok(edge(node('구로', '1-incheon'), node('구로', '1-cheonan')));
});

test('FUNC-016: 이름이 같아도 떨어진 역은 따로, 공식 역 이름을 쓴다', () => {
  assert.ok(byName('신촌') && byName('신촌(경의중앙)'));
  assert.ok(byName('불암산') && !byName('당고개'));
  assert.ok(byName('자양') && !byName('뚝섬유원지'));
  assert.deepEqual(byName('총신대입구(이수)').lines, ['4', '7']);
});

test('FUNC-016: 후보 역은 시트 초안대로 목적별 8곳 이상, 모두 그래프로 이어진 역', () => {
  assert.deepEqual([candidates.회식.length, candidates.회의.length, candidates.오락.length], [18, 11, 13]);
  const inGraph = new Set(graph.edges.map((e) => e.from.split(':')[0]));
  assert.ok(Object.values(candidates).flat().every((id) => inGraph.has(id)));
});

test('FUNC-016: 출발역은 수도권 전체 — 서울 밖 역(성남·고양·인천 등)도 목록과 그래프에 있다', () => {
  for (const name of ['모란', '대곡', '부평', '수원']) {
    const s = byName(name);
    assert.ok(s && !s.seoul, name);
    assert.ok(graph.edges.some((e) => e.from.startsWith(`${s.id}:`)), `${name} 그래프`);
  }
});

test('FUNC-016: 수도권 모든 역이 그래프에 있다 (동탄은 GTX-A, 운천·임진강은 문산에서 갈아타는 셔틀)', () => {
  const inGraph = new Set(graph.edges.flatMap((e) => [e.from.split(':')[0], e.to.split(':')[0]]));
  assert.deepEqual(stations.filter((s) => !inGraph.has(s.id)).map((s) => s.name), []);
  assert.ok(edge(node('동탄', 'GTX-A'), node('구성', 'GTX-A')));
  assert.ok(edge(node('임진강', '경의중앙-imjingang'), node('운천', '경의중앙-imjingang')));
  assert.equal(edge(node('문산', '경의중앙'), node('문산', '경의중앙-imjingang')).type, 'transfer');
});

test('FUNC-016: 하루 2회만 다니는 운천·임진강에는 trains_per_day가 있다', () => {
  assert.deepEqual(stations.filter((s) => s.trains_per_day).map((s) => [s.name, s.trains_per_day]), [['운천', 2], ['임진강', 2]]);
});

test('FUNC-016: 시연 시나리오 시트를 demo.json으로 바꾼다 (참여자 역 이름 → 역 id, 기대 결과)', () => {
  const [sc] = result.demo.scenarios;
  assert.equal(sc.purpose, '회식');
  assert.deepEqual(sc.participants.map((p) => [p.nickname, stations.find((s) => s.id === p.origin_station_id).name]), [
    ['감자', '연신내'], ['고구마', '청량리'], ['옥수수', '마포'], ['단호박', '압구정'],
  ]);
  assert.deepEqual(sc.expected, { station_id: byName('종로3가').id, score: 18.24, saved_minutes: 4 }); // 10/4 정차 시간 반영 후 기대값
});

test('FUNC-016: 변환을 두 번 실행해도 결과가 같다', () => {
  const again = convert();
  assert.equal(formatJson(again.graph), formatJson(graph));
  assert.equal(formatJson(again.stations), formatJson(stations));
});
