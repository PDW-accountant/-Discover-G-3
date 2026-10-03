# -Discover-G-3

팀 프로젝트 저장소입니다.

## 시작하기

```bash
git clone https://github.com/PDW-accountant/-Discover-G-3.git
cd -Discover-G-3
python -m venv .venv
# Windows: .venv\Scripts\activate   /   macOS·Linux: source .venv/bin/activate
cp .env.example .env   # 값 채우기
```

## 협업 규칙

- `main`에 직접 push하지 않습니다. 브랜치를 만들어 PR로 합칩니다.
- 브랜치 이름: `feat/기능명`, `fix/버그명`, `docs/문서명`
- 커밋 메시지: `feat: …`, `fix: …`, `docs: …`, `chore: …`
- `.env`, 데이터(`data/`), DB 덤프는 커밋하지 않습니다 (`.gitignore`로 막혀 있음).

## 라이선스

MIT
