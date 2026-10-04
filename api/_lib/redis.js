// Upstash Redis REST 호출 (개발 B). 서버 함수에서만 쓴다. 패키지 설치 없이 fetch로 부른다.
// 환경변수: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (대원이 Vercel에 등록)

/** 저장소가 연결되어 있는지. 없으면 방 기능을 끄고 총무 일괄 입력만 제공한다 (NFR-011). */
export function isRedisConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** Redis 명령 하나 실행. 예: redis(['HSET', 'room:abc', 'purpose', '회식']). 실패하면 예외(토큰은 메시지에 넣지 않는다). */
export async function redis(command) {
  if (!isRedisConfigured()) throw new Error('저장소가 연결되어 있지 않습니다');
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) throw new Error(`Redis 호출 실패 (${res.status}) ${data?.error ?? ''}`.trim());
  return data.result;
}
