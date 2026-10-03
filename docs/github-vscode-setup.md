# GitHub × VS Code 연동 가이드 (처음 하는 팀원용)

GitHub 계정을 막 만든 팀원이 **VS Code에서 우리 저장소를 받아서(clone), 수정하고, 올리기(push/PR)** 까지 할 수 있도록 순서대로 정리한 문서입니다.
위에서부터 차례대로 따라 하세요. (Windows 기준, macOS는 따로 표시)

- 저장소 주소: https://github.com/PDW-accountant/-Discover-G-3
- 예상 소요 시간: 30분 내외

---

## 전체 흐름 한눈에 보기

```
1. GitHub 계정 준비 (2단계 인증)
2. 저장소 초대 수락          ← 팀장이 먼저 초대해야 함
3. Git 설치
4. VS Code 설치
5. Git 사용자 정보 등록 (이름/이메일)
6. VS Code에서 GitHub 로그인
7. 저장소 Clone
8. 파이썬 가상환경 + .env 준비
9. 브랜치 → 커밋 → 푸시 → PR (매번 반복하는 작업)
```

---

## 1. GitHub 계정 준비

1. https://github.com 에서 가입한 계정으로 로그인합니다.
2. **이메일 인증**이 완료되었는지 확인합니다. (가입 시 받은 메일의 인증 링크 클릭)
3. **2단계 인증(2FA)** 을 켜 둡니다. GitHub에서 요구하는 경우가 많습니다.
   - 우측 상단 프로필 사진 → **Settings** → **Password and authentication** → **Enable two-factor authentication**
   - 휴대폰 인증 앱(Google Authenticator, Microsoft Authenticator 등)으로 QR 코드를 찍어 등록합니다.
   - 화면에 나오는 **복구 코드(Recovery codes)는 꼭 다운로드해서 보관**하세요. 휴대폰을 잃어버리면 이것 없이는 계정을 못 찾습니다.
4. 자신의 **GitHub 아이디(username)** 를 팀장에게 알려줍니다.

## 2. 저장소 초대 수락

> 이 저장소는 초대받은 사람만 push할 수 있습니다.

- **팀장**: 저장소 → **Settings** → **Collaborators** → **Add people** → 팀원 아이디 입력 후 초대
- **팀원**: GitHub 가입 이메일로 온 초대 메일의 **View invitation → Accept invitation** 클릭
  - 메일이 안 보이면 https://github.com/notifications 또는 저장소 주소로 직접 들어가면 초대 배너가 보입니다.
  - 초대는 **7일 안에** 수락해야 합니다. 지나면 팀장에게 다시 요청하세요.

## 3. Git 설치

Git은 내 컴퓨터에서 버전 관리를 해주는 프로그램입니다. (GitHub는 그 기록을 올려두는 웹사이트)

**Windows**
1. https://git-scm.com/download/win 에서 설치 파일을 받습니다.
2. 설치 중 옵션은 **기본값 그대로 Next** 를 누르면 됩니다.
   - "Choosing the default editor" 화면에서 **Use Visual Studio Code as Git's default editor** 를 선택하면 편합니다.
   - "Credential helper" 화면에서 **Git Credential Manager** 가 선택되어 있는지 확인합니다. (로그인 정보를 자동 저장해 줌)

**macOS**
- 터미널에서 `git --version` 을 입력하면 설치 안내가 뜹니다. 안내대로 설치하세요.

**설치 확인** (VS Code를 아직 안 켰다면, 설치 후 새로 연 터미널에서)
```bash
git --version
# git version 2.xx.x 처럼 나오면 성공
```

## 4. VS Code 설치

1. https://code.visualstudio.com 에서 설치합니다.
2. Windows 설치 시 아래 항목을 체크해 두면 편합니다.
   - **"Code(으)로 열기" 작업을 Windows 탐색기 메뉴에 추가**
   - **PATH에 추가**
3. (권장) 확장 프로그램 설치 — 왼쪽 사이드바의 블록 모양 아이콘(Extensions, `Ctrl+Shift+X`)
   - **Korean Language Pack** (한국어 메뉴)
   - **Live Server** (`index.html` 을 브라우저로 바로 열어 확인)
   - **GitHub Pull Requests** (VS Code 안에서 PR 확인/작성)

> Git을 VS Code보다 나중에 설치했다면 **VS Code를 완전히 껐다가 다시 켜야** Git을 인식합니다.

## 5. Git 사용자 정보 등록 (최초 1회)

커밋에 "누가 작성했는지" 기록하기 위한 설정입니다.
VS Code에서 **터미널 열기**: 상단 메뉴 **Terminal → New Terminal** (단축키 `` Ctrl+` ``)

```bash
git config --global user.name "내GitHub아이디"
git config --global user.email "GitHub에 등록한 이메일"
```

- 이메일은 **GitHub 계정에 등록된 이메일**과 같아야 GitHub에서 내 커밋으로 표시됩니다.
- 이메일을 공개하고 싶지 않다면: GitHub **Settings → Emails** 에 있는 `숫자+아이디@users.noreply.github.com` 주소를 대신 사용하세요.

설정 확인:
```bash
git config --global --list
```

## 6. VS Code에서 GitHub 로그인

1. VS Code 왼쪽 아래 **사람 모양 아이콘(Accounts)** 클릭
2. **Sign in with GitHub to use GitHub Pull Requests** (또는 비슷한 문구) 클릭
3. 브라우저가 열리면 GitHub 로그인 → **Authorize** 클릭
4. "VS Code를 여시겠습니까?" 팝업이 뜨면 **열기**

> 로그인을 따로 안 해도 7단계에서 처음 push할 때 로그인 창이 자동으로 뜹니다. 그때 **Sign in with your browser** 를 선택하면 됩니다.
> **GitHub 비밀번호를 터미널에 직접 입력하는 방식은 지원되지 않습니다.** 반드시 브라우저 로그인을 사용하세요.

## 7. 저장소 Clone (내 컴퓨터로 받기)

**방법 A — VS Code 화면에서 (추천)**
1. `Ctrl+Shift+P` → `Git: Clone` 입력 후 선택
2. **Clone from GitHub** 선택 → 목록에서 `PDW-accountant/-Discover-G-3` 선택
   (목록에 안 보이면 주소 `https://github.com/PDW-accountant/-Discover-G-3.git` 를 직접 붙여넣기)
3. 저장할 폴더 선택 (예: `C:\Projects`) — **한글·공백이 없는 경로**를 권장합니다.
4. "Would you like to open the cloned repository?" → **Open**

**방법 B — 터미널에서**
```bash
cd C:\Projects
git clone https://github.com/PDW-accountant/-Discover-G-3.git
code ./-Discover-G-3
```

> ⚠️ 폴더 이름이 `-` 로 시작합니다. Git Bash/macOS 터미널에서 `cd -Discover-G-3` 라고 치면 옵션으로 오해해서 에러가 납니다. **`cd ./-Discover-G-3`** 처럼 앞에 `./` 를 붙이세요.

## 8. 화면 확인 + Claude Code 사용

- 화면 확인: 저장소의 `index.html` 을 오른쪽 클릭 → **Open with Live Server**. 휴대폰 크기는 브라우저 `F12` → 기기 모드 → 가로 375.
- 저장소 루트의 `CLAUDE.md` 에 팀 작업 규칙이 적혀 있습니다. 이 폴더에서 Claude Code를 실행하면 자동으로 읽고 아래 9장의 git 절차를 대신 지켜 줍니다. "작업 시작", "저장해줘", "작업 끝(PR 만들어줘)" 처럼 말하면 됩니다.
- API 키는 대원이 관리합니다. **키를 코드·채팅에 붙여넣지 마세요.** 서버 함수까지 로컬에서 돌려야 하는 사람만 `.env.local` 을 따로 안내받습니다(GitHub에 올라가지 않음).

## 9. 작업 흐름: 브랜치 → 커밋 → 푸시 → PR

> 우리 팀 규칙: **`main` 에 직접 push 하지 않습니다.** 항상 브랜치를 만들어 PR로 합칩니다.

### 9-1. 작업 시작 전: 최신 코드 받기
- VS Code 왼쪽 아래 브랜치 이름이 `main` 인지 확인
- `Ctrl+Shift+P` → `Git: Pull`
```bash
git checkout main
git pull
```

### 9-2. 내 브랜치 만들기
- VS Code 왼쪽 아래 브랜치 이름(`main`) 클릭 → **Create new branch** → 이름 입력
- 브랜치 이름 규칙: `feature/[이름]-[기능]`, 영문 소문자 (예: `feature/jiwon-input-form`)
```bash
git checkout -b feature/jiwon-input-form
```

### 9-3. 수정 후 커밋하기
1. 왼쪽 사이드바 **Source Control** 아이콘 (`Ctrl+Shift+G`)
2. 변경된 파일 옆 **`+`** 를 눌러 Stage (올릴 파일 선택)
3. 위쪽 메시지 칸에 커밋 메시지 작성 → **Commit** 클릭
   - 메시지 규칙: 한국어 한 줄로 "무엇을 바꿨는지" (예: `출발역 검색 목록에 호선 표시 추가`)
```bash
git add .
git commit -m "출발역 검색 목록에 호선 표시 추가"
```

### 9-4. GitHub에 올리기 (push)
- Source Control 화면에서 **Publish Branch** (처음) 또는 **Sync Changes** 클릭
```bash
git push -u origin feature/jiwon-input-form    # 처음 한 번
git push                              # 그 이후
```
- push하고 1~2분 뒤 내 브랜치 전용 미리보기 주소에서 실제 화면을 볼 수 있습니다. PR 전에도 생기고, 다시 push하면 같은 주소가 최신 내용으로 바뀝니다.
  주소 형식: `https://eodiga3-git-<브랜치명>-pw-c-discover-g-3.vercel.app` (브랜치명의 `/`는 `-`로 바뀜. 브랜치 이름이 길면 주소가 줄어드니 PR의 Vercel 댓글에서 정확한 주소를 확인)

### 9-5. Pull Request(PR) 만들기
1. GitHub 저장소 페이지에 들어가면 노란 배너 **Compare & pull request** 가 보입니다. 클릭
2. 제목·설명 작성 (템플릿이 자동으로 채워짐) → **Create pull request**
3. PR 링크를 단톡방에 공유 → **병합(Merge)은 대원이 합니다**
4. 내 컴퓨터에서 다시 `main` 으로 돌아가 `git pull` (9-1로 돌아가기)

---

## 자주 겪는 문제

| 증상 | 해결 |
|---|---|
| `git` 명령을 찾을 수 없다고 나옴 | Git 설치 후 **VS Code·터미널을 완전히 재시작**. 그래도 안 되면 PC 재부팅 |
| push 시 `Permission denied` / `403` | 저장소 초대를 **수락했는지** 확인(2단계). 다른 GitHub 계정으로 로그인되어 있을 수도 있음 → 아래 "계정 바꾸기" 참고 |
| push 시 `rejected (fetch first)` | 다른 사람이 먼저 올린 변경이 있음 → `git pull` 후 다시 `git push` |
| `Please tell me who you are` | 5단계(이름/이메일 등록)를 안 한 것 |
| 커밋했는데 GitHub에 내 프로필이 안 뜸 | `user.email` 이 GitHub 등록 이메일과 다름 → 5단계 다시 확인 |
| 실수로 `main` 에서 작업함 (아직 커밋 전) | 그대로 `git checkout -b feature/이름-기능` 하면 변경사항이 새 브랜치로 따라옴 |
| 머지 충돌(conflict) 발생 | VS Code가 충돌 부분을 색으로 표시함 → **Accept Current / Incoming / Both** 중 선택 후 저장·커밋. 모르겠으면 혼자 해결하지 말고 팀에 공유 |

**다른 GitHub 계정으로 로그인되어 있을 때 (Windows)**
1. 시작 메뉴 → **자격 증명 관리자** → **Windows 자격 증명**
2. `git:https://github.com` 항목 **제거**
3. 다시 push 하면 로그인 창이 새로 뜸

---

## 체크리스트

- [ ] GitHub 이메일 인증 + 2단계 인증 완료 (복구 코드 보관)
- [ ] 팀장에게 아이디 전달 → 초대 수락
- [ ] `git --version` 확인
- [ ] VS Code 설치 + Live Server 확장 설치
- [ ] `git config --global user.name / user.email` 설정
- [ ] VS Code에서 GitHub 로그인
- [ ] 저장소 Clone
- [ ] 테스트 브랜치 만들어서 push → PR 생성까지 한 번 해보기
