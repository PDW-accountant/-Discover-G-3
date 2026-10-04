// 서울 열린데이터광장 지하철 시간표 받기 (FUNC-016 보조 도구, #14)
// 실행: node scripts/timetable/collect-seoul.cjs   (이미 받은 파일은 건너뛴다)
// 키: 환경변수 SEOUL_API_KEY 또는 저장소 루트 .env.local 의 SEOUL_API_KEY (서울 열린데이터광장 일반 인증키. git 에 올리지 않는다)
// 결과: scripts/timetable/raw/seoul/ (약 55MB, git 에 올리지 않음) → build-seoul.cjs 가 읽는다
// 쓰는 API: subwayStationMaster(역 목록·역코드, OA-21232), SearchSTNTimeTableByIDService(역코드로 열차 시간표)
// 시간표 API 는 서울교통공사 1~9호선과 그 열차가 직통으로 다니는 코레일 구간만 데이터가 있다 (그 밖은 빈 목록).

const fs = require("fs");
const path = require("path");
const { loadKey } = require("./key.cjs");

const OUT = path.join(__dirname, "raw", "seoul");
const BASE = "http://openapi.seoul.go.kr:8088";
const KEY = loadKey("SEOUL_API_KEY");
const GAP_MS = 150;

async function call(service, args, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    await new Promise(r => setTimeout(r, GAP_MS));
    try {
      const json = JSON.parse(await (await fetch(`${BASE}/${KEY}/json/${service}/${args.join("/")}/`, { signal: AbortSignal.timeout(60000) })).text());
      const body = json[service];
      const result = body?.RESULT ?? json.RESULT;
      if (result?.CODE === "INFO-000") return { rows: body.row ?? [], total: body.list_total_count };
      if (result?.CODE === "INFO-200") return { rows: [], total: 0 }; // 해당 데이터 없음
      throw new Error(`${result?.CODE} ${result?.MESSAGE}`);
    } catch (e) {
      if (i === tries) throw new Error(`${service} ${args.join("/")}: ${e.message}`);
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

async function main() {
  fs.mkdirSync(path.join(OUT, "timetable"), { recursive: true });
  const masterFile = path.join(OUT, "stations.json");
  if (!fs.existsSync(masterFile)) fs.writeFileSync(masterFile, JSON.stringify((await call("subwayStationMaster", [1, 1000])).rows, null, 1));
  const stations = JSON.parse(fs.readFileSync(masterFile, "utf8"));
  const stat = { cached: 0, fetched: 0, empty: 0, failed: 0 };
  for (const st of stations) {
    for (const dir of ["1", "2"]) { // 1 = 상행·내선, 2 = 하행·외선
      const file = path.join(OUT, "timetable", `${st.BLDN_ID}_1_${dir}.json`);
      if (fs.existsSync(file)) { stat.cached++; continue; }
      try {
        const { rows, total } = await call("SearchSTNTimeTableByIDService", [1, 1000, st.BLDN_ID, "1", dir]); // 1 = 평일
        if (total > rows.length) throw new Error(`${st.BLDN_ID} ${dir}: ${total}건 중 ${rows.length}건만 받음`);
        fs.writeFileSync(file, JSON.stringify(rows));
        stat[rows.length ? "fetched" : "empty"]++;
      } catch (e) { stat.failed++; console.error(e.message); }
    }
  }
  console.log(`역 ${stations.length}개`, JSON.stringify(stat));
}

main().catch(e => { console.error(e.message); process.exit(1); });
