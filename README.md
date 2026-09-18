# 네이버 블로그 자동발행 (로컬 전용)

## 왜 로컬 스크립트인가
- 네이버는 블로그 글쓰기 오픈API(`writePost.json`)를 2020년에 어뷰징 방지를 이유로 완전히 폐지했습니다.
- 따라서 이 프로젝트는 사용자 PC의 실제 Chrome을 Selenium으로 조작해, 로그인된 세션으로
  블로그 글쓰기 화면에 직접 입력·발행하는 방식으로 동작합니다.
- **이용약관상 회색지대이며, 과도하게/기계적으로 사용하면 계정 저품질·제재 위험이 있습니다.**
  하루 1~2개, 사람이 쓴 것처럼 보이는 원본 콘텐츠 위주로만 사용하세요.

## 최초 설치

```bash
cd blog_naver
.venv\Scripts\python.exe -m pip install -r requirements.txt
copy config.example.json config.json
```

`config.json`을 열어 `blog_id`가 본인 블로그 아이디인지 확인하세요.

## 최초 실행 (로그인 세션 만들기)

```bash
.venv\Scripts\python.exe auto_post.py --inspect
```

- 크롬 창이 새로 뜨면 **직접 네이버에 로그인**합니다 (비밀번호는 본인이 입력).
- 로그인 후 터미널에서 Enter를 누르면 글쓰기 화면 DOM을 `debug_dom.html`로 저장합니다.
- 로그인 세션은 `chrome_profile/` 폴더에 저장되어 다음 실행부터는 자동으로 로그인 상태가 유지됩니다.
  (이 폴더는 `.gitignore`에 포함되어 있어 GitHub에는 절대 올라가지 않습니다.)

## 글 발행하기

1. `posts/` 폴더에 마크다운 파일 작성 (형식은 `posts/2026-09-18_agentic-ai.md` 예시 참고)
2. 실행:
   ```bash
   .venv\Scripts\python.exe auto_post.py
   ```
3. `config.json`의 `dry_run: true`(기본값) 상태에서는 제목/본문 입력까지만 자동으로 하고 멈춥니다.
   화면을 직접 확인하고 카테고리·태그·공개설정을 확인한 뒤 **발행 버튼은 직접 누르는 것을 권장**합니다.
4. 익숙해지고 나서 `dry_run: false`로 바꾸면, 터미널에서 `(예/아니오)`로 한 번 더 물어본 뒤
   "예"를 입력해야 최종 발행 버튼까지 자동으로 클릭합니다.

## 창 없이(headless) 실행하기

`config.json`의 `headless`를 `true`로 바꾸면 크롬 창이 뜨지 않고 백그라운드로 동작합니다.
단, **로그인 세션이 이미 만들어져 있어야** 합니다 (headless 상태에서는 로그인 화면을 볼 수 없어
로그인이 안 돼 있으면 바로 에러로 종료됩니다). 세션이 만료되면 `headless`를 잠깐 `false`로
바꿔서 한 번 로그인한 뒤 다시 `true`로 돌리면 됩니다.

## 선택자(SELECTORS)가 안 맞을 때

네이버 SmartEditor는 클래스명이 배포마다 바뀔 수 있어(`auto_post.py`의 `SELECTORS` 참고),
실제 화면과 안 맞아 에러가 날 수 있습니다. 그럴 경우:

1. `python auto_post.py --inspect` 실행 → `debug_dom.html` 생성
2. 에러 메시지 + `debug_dom.html` 내용을 개발 세션(Claude)에 공유
3. `SELECTORS` 값을 같이 수정

## 루틴(자동화) 설정

자동화는 **두 개**로 나뉩니다. 초안 작성은 클라우드에서 할 수 있지만,
발행은 본인 PC의 로그인된 Chrome이 필요해서 클라우드에서 절대 불가능합니다.

| 루틴 | 하는 일 | 도는 곳 | 기본 시각(KST) |
|---|---|---|---|
| 1. 초안 생성 | `posts/` 에 draft 마크다운 작성 후 커밋·푸시 | Claude 루틴 (클라우드) | 매일 08:00 |
| 2. 발행 | `git pull` 후 draft 하나를 네이버에 발행 | Windows 작업 스케줄러 (내 PC) | 매일 08:40 |

1번이 초안을 올려두고, 2번이 그걸 받아 발행하는 순서라서 시각이 40분 벌어져 있습니다.

### 루틴 1 — Claude 초안 생성 (클라우드)

claude.ai/code 의 **Routines(루틴)** 메뉴에서 관리합니다. cron은 **UTC 기준**이라
한국시간에서 9시간을 빼야 합니다 (예: KST 08:00 → `0 23 * * *`). 최소 간격은 보통 1시간입니다.

발행은 하지 않고 초안만 만들기 때문에, 이 루틴이 잘못 돌아도 블로그에는 아무 일도 생기지 않습니다.
초안이 이미 있으면 새로 만들지 않도록 프롬프트에 조건이 들어가 있습니다.

### 루틴 2 — 발행 예약 (내 PC)

```powershell
# 프로젝트 폴더에서 한 번만 실행하면 작업 스케줄러에 등록됩니다
powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1

# 시각을 바꾸려면
powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1 -Time 21:30
```

스크립트가 `run_auto_post.bat` 을 매일 지정 시각에 실행하도록 등록하고,
등록 전에 `config.json`·로그인 세션·가상환경이 준비됐는지 점검해서 경고를 띄웁니다.

무인 실행 전 **필수 준비**:

1. `python auto_post.py --inspect` 로 네이버에 한 번 로그인 (`chrome_profile/` 생성)
2. `config.json` 에서 `headless: true` (창 없이 실행)
3. `config.json` 에서 `dry_run: false` (실제 발행까지 진행)

등록 후 관리 명령:

```powershell
Start-ScheduledTask   -TaskName NaverBlogAutoPost   # 즉시 한 번 시험
Get-ScheduledTaskInfo -TaskName NaverBlogAutoPost   # 마지막 실행 결과
Unregister-ScheduledTask -TaskName NaverBlogAutoPost -Confirm:$false   # 삭제
```

실행 기록은 `logs/auto_post.log` 에 쌓입니다 (git 제외).

### `--unattended` 옵션 주의

작업 스케줄러에는 터미널이 없어서, 평소의 `(예/아니오)` 확인 단계에서
`input()` 이 `EOFError` 로 죽습니다. 그래서 `run_auto_post.bat` 은
`auto_post.py --unattended` 로 호출해 그 확인 단계를 생략합니다.

**즉 예약 실행은 사람이 최종 검토하는 안전장치 없이 발행합니다.**
README 앞부분 경고대로 하루 1~2개를 넘기지 말고, 초안 품질을 믿을 수 있을 때만
`dry_run: false` 로 바꾸세요. 손으로 실행할 때는 `--unattended` 를 붙이지 않는 한
확인 절차가 그대로 유지됩니다.

### 예약 없이 PC가 꺼져 있으면

작업 스케줄러 작업은 **PC가 켜져 있고 로그인된 상태**에서만 돕니다.
`-StartWhenAvailable` 이 켜져 있어 시각을 놓치면 다음 부팅 후 따라잡아 실행합니다.

## 폴더 구조

```
blog_naver/
  auto_post.py             # 메인 스크립트
  run_auto_post.bat        # 작업 스케줄러가 호출하는 실행 래퍼
  setup_task_scheduler.ps1 # 작업 스케줄러 등록 스크립트
  config.example.json      # 설정 예시 (카테고리 매핑 포함)
  config.json              # 실제 설정 (git 제외)
  chrome_profile/          # 로그인 세션 (git 제외, 절대 커밋 금지)
  posts/                   # 발행 초안/이력 (status: draft -> published)
  logs/                    # 예약 실행 로그 (git 제외)
```
