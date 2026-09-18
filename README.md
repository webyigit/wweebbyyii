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

| 루틴 | 하는 일 | 도는 곳 | 시각(KST) |
|---|---|---|---|
| 1. 초안 생성 | 하루치 초안 6개를 만들어 커밋·푸시 | Claude 루틴 (클라우드) | 매일 06:30, 1회 |
| 2. 발행 | `git pull` 후 draft 하나를 네이버에 발행 | Windows 작업 스케줄러 (내 PC) | 08:00부터 1시간 30분 간격 6회 |

발행 시각은 **08:00, 09:30, 11:00, 12:30, 14:00, 15:30** 입니다.
1번이 06:30에 하루치를 다 올려두고, 2번이 그걸 하나씩 집어가 발행합니다.

> **발행량 경고**: 하루 6개는 README 맨 위의 권장치(1~2개)를 크게 넘습니다.
> 기계적 대량 발행은 저품질·제재 위험이 실재합니다. 개수와 간격은
> `routine.json` 과 `setup_task_scheduler.ps1` 인자로 언제든 줄일 수 있습니다.

### 개수·카테고리 설정 (`routine.json`)

초안 개수와 카테고리는 `routine.json` 하나에서 관리합니다.
이 파일은 **git에 커밋되므로 클라우드 루틴이 읽을 수 있습니다**
(`config.json` 은 git 제외라 루틴이 못 봅니다).

카테고리는 **6개 대분류 × 5개 중분류 = 30개** 구조입니다.

| 대분류 | 중분류 |
|---|---|
| AI에이전트 | 에이전틱AI, 멀티모달AI, 온디바이스AI, 버티컬AI, 소버린AI |
| 클라우드인프라 | 하이브리드클라우드, 멀티클라우드, 엣지컴퓨팅, 클라우드FinOps, AI인프라경쟁 |
| 보안트렌드 | 제로트러스트, 지속인증, RBI보안, AI위협탐지, 버그바운티 |
| 디바이스테크 | 5GSA전환, AI반도체NPU, AIPC, 피지컬AI, 엣지디바이스 |
| IT산업이슈 | AI개발속도논쟁, AI거버넌스, AI저작권분쟁, 빅테크AI투자, AI규제정책 |
| AI위클리브리핑 | 허깅페이스논문, 허깅페이스모델, 허깅페이스블로그, 깃허브트렌딩, 레딧AI커뮤니티 |

배정 규칙:

- **대분류 하나당 하루 1개**입니다. 대분류가 6개이고 `posts_per_day` 가 6이라,
  하루 6개가 6개 대분류에 각각 하나씩 들어가 카테고리 중복이 구조적으로 생기지 않습니다.
- 각 대분류 안에서 중분류는 `posts/` 이력을 보고 **가장 오래 안 쓴 것**을 고릅니다.
  같은 중분류가 며칠 연속 나오지 않게 하는 장치입니다.
- 이 목록은 최초 커밋의 `category_map` 을 복원한 것입니다. 네이버 블로그에서
  카테고리 이름을 바꾸거나 지웠다면 `routine.json` 도 같이 고쳐주세요 —
  `auto_post.py` 는 중분류 이름으로 드롭다운을 클릭하므로, 없는 이름이면
  카테고리 선택이 실패하고 기본 카테고리로 발행됩니다.

### 루틴 1 — Claude 초안 생성 (클라우드)

claude.ai/code 의 **Routines(루틴)** 메뉴에서 관리합니다. cron은 **UTC 기준**이라
한국시간에서 9시간을 빼야 합니다 (예: KST 06:30 → `30 21 * * *`). 최소 간격은 보통 1시간입니다.

주제는 루틴이 카테고리에 맞춰 직접 고릅니다. 이미 발행된 글과 겹치지 않게,
그리고 같은 날 만든 6개끼리도 서로 비슷해지지 않게 쓰도록 지시돼 있습니다.

파일명은 `posts/YYYY-MM-DD_NN_슬러그.md` 형식입니다. `auto_post.py` 가
파일명 정렬순으로 초안을 집어가므로 `NN` 순번이 곧 발행 순서가 됩니다.

발행은 하지 않고 초안만 만들기 때문에, 이 루틴이 잘못 돌아도 블로그에는 아무 일도 생기지 않습니다.
이미 대기 중인 초안이 하루치를 채우고 있으면 아무것도 만들지 않습니다.

### 루틴 2 — 발행 예약 (내 PC)

```powershell
# 프로젝트 폴더에서 한 번만 실행하면 작업 스케줄러에 등록됩니다
# (기본: 08:00부터 90분 간격 6회)
powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1

# 하루 3개, 2시간 간격, 오전 10시 시작으로 줄이려면
powershell -ExecutionPolicy Bypass -File .\setup_task_scheduler.ps1 -Time 10:00 -IntervalMinutes 120 -Count 3
```

스크립트가 `run_auto_post.bat` 을 지정한 시각·간격·횟수로 실행하도록 등록하고,
등록 전에 `config.json`·로그인 세션·가상환경, 그리고 `routine.json` 의
개수/카테고리가 `-Count` 와 맞는지 점검해서 경고를 띄웁니다.
등록이 끝나면 실제 발행 시각 6개를 출력해줍니다.

발행할 초안이 없는 회차는 `[대상 없음]` 으로 그냥 종료되므로,
초안이 모자라도 에러가 쌓이거나 중복 발행이 되지는 않습니다.

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
  routine.json             # 초안 개수/카테고리 풀 (클라우드 루틴이 읽음)
  config.example.json      # 발행 설정 예시
  config.json              # 실제 설정 (git 제외)
  chrome_profile/          # 로그인 세션 (git 제외, 절대 커밋 금지)
  posts/                   # 발행 초안/이력 (status: draft -> published)
  logs/                    # 예약 실행 로그 (git 제외)
```
