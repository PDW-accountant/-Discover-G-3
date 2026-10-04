// API 키 읽기: 환경변수 → 저장소 루트 .env.local 순서. 키는 코드나 git 에 넣지 않는다 (CLAUDE.md "키 취급")
const fs = require("fs");
const path = require("path");

function loadKey(name) {
  if (process.env[name]) return process.env[name].trim();
  const file = path.join(__dirname, "..", "..", ".env.local");
  const m = fs.existsSync(file) && fs.readFileSync(file, "utf8").match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!m) throw new Error(`${name} 키가 없어요. 환경변수나 .env.local 에 ${name}=값 을 넣어 주세요`);
  return m[1].trim();
}

module.exports = { loadKey };
