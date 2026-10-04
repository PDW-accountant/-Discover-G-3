# 어디Gㅏ3

서울에서 3~9명이 약속을 잡을 때, 모두에게 공평한 지하철역 1곳과 근처 만남 장소 3곳을 추천하는 웹앱입니다. 삼일회계법인 2026 Discover 사전 미션 G-3조.

- 사이트: https://eodiga3.vercel.app
- 작업 규칙: [CLAUDE.md](CLAUDE.md) · 처음 세팅: [docs/github-vscode-setup.md](docs/github-vscode-setup.md)

## 시작하기

```bash
git clone https://github.com/PDW-accountant/-Discover-G-3.git
cd ./-Discover-G-3
npm test        # 자동 검사 (설치할 것 없음, Node만 있으면 됨)
```

- 화면 보기: VS Code Live Server로 `index.html` 열기
- 서버 함수(모임 방)까지: `.env.example`을 `.env.local`로 복사해 값을 넣고 `npx vercel dev`

## 협업 규칙

- `main`에 직접 push하지 않습니다. `feature/[이름]-[기능]` 브랜치에서 작업하고 PR로 합칩니다. 병합은 대원이 합니다.
- 브랜치를 push하면 1~2분 뒤 그 브랜치 전용 미리보기 주소가 생깁니다: `https://eodiga3-git-<브랜치명>-pw-c-discover-g-3.vercel.app` (브랜치 이름이 길면 주소가 줄어드니 PR의 Vercel 댓글에서 확인)
- 커밋 메시지: 한국어 한 줄 + `(#이슈번호)`. 예: `출발역 검색 목록에 호선 표시 추가 (#3)`
- `.env`, `.env.local`, 토큰은 커밋하지 않습니다 (`.gitignore`로 막혀 있음).

## 라이선스

MIT
