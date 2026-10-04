// TAGO 지하철 시간표 받기 (FUNC-016 보조 도구, #14)
// 실행: node scripts/timetable/collect-tago.cjs   (이미 받은 파일은 건너뛴다)
// 키: 환경변수 DATA_GO_KR_KEY 또는 저장소 루트 .env.local 의 DATA_GO_KR_KEY (공공데이터포털 인증키. git 에 올리지 않는다)
// 결과: scripts/timetable/raw/tago/ (약 60MB, git 에 올리지 않음) → build-tago.cjs 가 읽는다
// 개발계정 하루 호출 한도(10,000회)와 초당 호출 제한 때문에 한 건씩 간격을 두고 부른다.

const fs = require("fs");
const path = require("path");
const { loadKey } = require("./key.cjs");

const OUT = path.join(__dirname, "raw", "tago");
const BASE = "https://apis.data.go.kr/1613000/SubwayInfo";
const KEY = loadKey("DATA_GO_KR_KEY");
const GAP_MS = 400;
const DAILY_TYPE = "01"; // 평일

// 수도권 노선만 (역 ID 앞부분). 부산·대구·대전·광주 등은 뺀다
const CAPITAL_PREFIXES = [
  "MTRS", "MTRKR", "MTRKRK", "MTRARA", "MTRDXD", "MTREVE", "MTRGMG", "MTRGXAX", "MTRSRAX",
  "MTRIC", "MTRICI", "MTRKRWSS", "MTRSWWSS", "MTRSLL", "MTRUIUIS", "MTRULU",
];
const EXCLUDED_ROUTE_NAMES = new Set(["동해", "대경선"]); // MTRKRK 안의 수도권 밖 노선

async function call(op, params, tries = 6) {
  const qs = new URLSearchParams({ serviceKey: KEY, _type: "json", ...params });
  for (let i = 1; i <= tries; i++) {
    await new Promise(r => setTimeout(r, GAP_MS));
    try {
      const json = JSON.parse(await (await fetch(`${BASE}/${op}?${qs}`, { signal: AbortSignal.timeout(60000) })).text());
      if (json.response?.header?.resultCode === "00") return json.response.body;
      const err = json.OpenAPI_ServiceResponse?.cmmMsgHeader;
      const e = new Error(json.response ? json.response.header.resultMsg : `${err?.returnReasonCode} ${err?.errMsg}`);
      e.rateLimited = err?.returnReasonCode === "23";
      throw e;
    } catch (e) {
      if (i === tries) throw new Error(`${op} ${JSON.stringify(params)}: ${e.message}`);
      await new Promise(r => setTimeout(r, e.rateLimited ? 3000 * i : 1000 * i));
    }
  }
}

const asList = x => (x ? [].concat(x) : []);

async function main() {
  fs.mkdirSync(path.join(OUT, "timetable"), { recursive: true });
  const stationsFile = path.join(OUT, "stations.json");
  if (!fs.existsSync(stationsFile)) {
    const body = await call("GetKwrdFndSubwaySttnList", { numOfRows: 3000, pageNo: 1 });
    const stations = asList(body.items?.item).filter(s =>
      CAPITAL_PREFIXES.includes(s.subwayStationId.match(/^MTR[A-Z]+/)[0]) && !EXCLUDED_ROUTE_NAMES.has(s.subwayRouteName));
    fs.writeFileSync(stationsFile, JSON.stringify(stations, null, 1));
  }
  const stations = JSON.parse(fs.readFileSync(stationsFile, "utf8"));
  const stat = { cached: 0, fetched: 0, failed: 0 };
  for (const s of stations) {
    for (const dir of ["U", "D"]) {
      const file = path.join(OUT, "timetable", `${s.subwayStationId}_${DAILY_TYPE}_${dir}.json`);
      if (fs.existsSync(file)) { stat.cached++; continue; }
      try {
        const body = await call("GetSubwaySttnAcctoSchdulList", {
          numOfRows: 1000, pageNo: 1, subwayStationId: s.subwayStationId, dailyTypeCode: DAILY_TYPE, upDownTypeCode: dir,
        });
        const items = asList(body.items?.item);
        if (Number(body.totalCount) > items.length) throw new Error(`${s.subwayStationId} ${dir}: ${body.totalCount}건 중 ${items.length}건만 받음`);
        fs.writeFileSync(file, JSON.stringify(items));
        stat.fetched++;
      } catch (e) { stat.failed++; console.error(e.message); }
    }
  }
  console.log(`역 ${stations.length}개`, JSON.stringify(stat));
}

main().catch(e => { console.error(e.message); process.exit(1); });
