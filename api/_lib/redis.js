// Upstash Redis REST 호출 (개발 B). 서버 함수에서만 쓴다. 패키지 설치 없이 fetch로 부른다.
// 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (대원이 Vercel에 등록)

/** 저장소가 연결되어 있는지. 없으면 방 기능을 끄고 총무 일괄 입력만 제공한다 (NFR-011). */
export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** Redis 명령 하나 실행. 예: redis(['HSET', 'room:abc', 'purpose', '회식']) */
export async function redis(command) {
  throw new Error('아직 구현되지 않았습니다');
}
