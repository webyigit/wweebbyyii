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

## 예약 실행 (Windows 작업 스케줄러)

1. 작업 스케줄러 → 기본 작업 만들기
2. 트리거: 매일, 원하는 시간
3. 동작: 프로그램 시작
   - 프로그램: `C:\Users\webyi\Desktop\blog_naver\.venv\Scripts\python.exe`
   - 인수: `auto_post.py`
   - 시작 위치: `C:\Users\webyi\Desktop\blog_naver`

## 폴더 구조

```
blog_naver/
  auto_post.py          # 메인 스크립트
  config.example.json   # 설정 예시 (카테고리 매핑 포함)
  config.json           # 실제 설정 (git 제외)
  chrome_profile/       # 로그인 세션 (git 제외, 절대 커밋 금지)
  posts/                # 발행 초안/이력 (status: draft -> published)
```

---

# 마곡 맛집 페이지

`docs/magok-matjip/index.html` — 마곡역·마곡나루역 주변 식당을 종류별로 묶은 한 장짜리
정적 페이지입니다. 빌드 과정이 없어서 파일을 그대로 열어도 되고, GitHub Pages를 `docs/`
폴더로 켜면 바로 공개됩니다.

가게 데이터는 파일 안의 `<script type="application/json" id="places-data">` 블록에 들어
있습니다. 직접 고쳐도 되고, 아래 스크립트로 네이버·캐치테이블에서 받아와 채워도 됩니다.

분류는 고기·구이 / 한식·국물 / 분식 / 회·해산물 / 일식 / 중식 / 아시안 / 양식·피자 /
카페·베이커리 / 술집 열 가지입니다. 분류를 더 넣으려면 `index.html`의 `CATS` 배열과
`fetch_places.py`의 `QUERIES`·`CATEGORY_RULES`·정렬 순서를 같이 고쳐야 합니다.

## 폰트

본문은 프리텐다드(Pretendard)입니다. CDN을 쓰지 않고 `docs/magok-matjip/fonts/`에 넣은
가변 폰트를 `@font-face`로 직접 물립니다. 유니코드 범위별로 92개 파일로 쪼갠 서브셋이라
브라우저가 실제 화면에 쓰는 글자 파일만 내려받습니다 (전체 3.1MB 중 보통 400KB 안팎).
폰트는 SIL Open Font License 1.1이고 전문은 `docs/magok-matjip/fonts/OFL.txt`에 있습니다.

## 데이터 채우기

```bash
python fetch_places.py                 # 네이버 지역검색만
python fetch_places.py --catchtable    # 네이버 + 캐치테이블 예약 링크
python fetch_places.py --dry-run       # 파일은 그대로 두고 결과만 확인
```

**네이버**는 지역검색 오픈API를 씁니다. 화면을 긁는 게 아니라 공개 API라서 약관 문제가
없습니다. https://developers.naver.com 에서 애플리케이션을 등록하고 "검색" API를 추가하면
키가 나옵니다. 무료이고 하루 25,000회까지 됩니다. `config.json`에 넣으세요.

```json
{
  "naver_client_id": "...",
  "naver_client_secret": "..."
}
```

이 API는 한 번 호출에 최대 5건만 돌려주기 때문에, `fetch_places.py`의 `QUERIES` 목록처럼
키워드를 여러 개 던져서 모으는 구조입니다. 빠진 종류가 있으면 `QUERIES`에 키워드를
추가하면 됩니다. 받아오는 값은 상호명·분류·도로명주소·전화번호입니다. **평점과 리뷰는
가져오지 않습니다** (지역검색 API가 주지 않습니다).

**캐치테이블**은 공개 API가 없습니다. `--catchtable`을 붙이면 `auto_post.py`와 같은 방식으로
로컬 크롬을 열어 검색 결과에 떠 있는 예약 페이지 주소(`/ct/shop/<슬러그>`)만 읽어옵니다.
가게 이름과 링크만 보고 리뷰·사진은 건드리지 않습니다. 짧은 간격으로 반복 실행하지 마세요.

## 다시 받아와도 안 지워지는 것

직접 써 넣은 한 줄 소개(`note`)와 위치 설명(`where`)은 그대로 둡니다. 주소·전화번호·분류만
새 값으로 덮어쓰고, 네이버에서 새로 나온 가게는 목록 뒤에 붙습니다. 새로 붙은 가게는
소개글이 비어 있으니 직접 채워 넣으세요.

## 별점 · 메뉴 가격 · 사진 채우기

`crawl_naver_place.py` 는 네이버 플레이스에서 별점·리뷰수·메뉴·가격·사진을 받아옵니다.
사장님 PC에서 로컬 크롬으로 돕니다.

```bash
python crawl_naver_place.py --limit 5 --dry-run   # 먼저 5곳만 시험
python crawl_naver_place.py                        # 별점 · 리뷰수 · 메뉴/가격
python crawl_naver_place.py --photos               # 사진까지
python crawl_naver_place.py --only 특삼겹 몽중헌     # 특정 가게만
python crawl_naver_place.py --force                # 이미 값이 있어도 다시
```

**처음에는 꼭 `--limit 5 --dry-run` 으로 한 번 돌려 보세요.** 결과가 제대로 나오는지
확인한 뒤 전체를 돌리는 게 안전합니다.

동작 방식은 이렇습니다. 네이버 검색으로 가게의 플레이스 ID를 찾고, 모바일 플레이스
페이지를 연 다음 **화면이 들고 있는 데이터 뭉치(`window.__APOLLO_STATE__`)를 통째로 읽습니다.**
CSS 클래스명을 짚지 않기 때문에 네이버가 화면 디자인을 바꿔도 잘 안 깨집니다. 그 뭉치가
없으면 화면 글자에서 정규식으로 점수만이라도 건지는 쪽으로 물러섭니다.

값이 여러 개 잡히면 **리뷰 수가 가장 많은 항목**을 그 가게 본체로 봅니다. 메뉴는 대표 메뉴를
앞으로 올리고, "시가" 처럼 숫자가 아닌 가격은 버립니다.

### 순위는 어떻게 매겨지나

분류마다 별점이 높은 5곳에 순위 딱지가 붙습니다. 점수가 같으면 리뷰가 많은 쪽이 앞입니다.
**별점이 없는 곳은 0점이 아니라 순위에서 빠집니다.** 정렬에서도 뒤로 갑니다.

### 사진

`--photos` 로 받은 사진은 가게나 다른 이용자가 올린 것이라 공개 페이지에 그대로 쓰면
저작권 문제가 생길 수 있습니다. 직접 찍은 사진을 `docs/magok-matjip/photos/` 에 넣는 걸
권합니다. 같은 이름 파일이 이미 있으면 크롤링이 덮어쓰지 않으니, **직접 찍은 사진을 먼저
넣어 두면 안전합니다.** 자세한 내용은 `docs/magok-matjip/photos/README.md` 참고.

### 주의

네이버 화면을 읽는 방식이라 약관상 회색지대입니다. `auto_post.py` 와 같은 수준으로 보세요.
가게 사이에 3초씩 쉬면서 천천히 돕니다. 하루에 몇 번씩 반복해서 돌리지 마세요.
