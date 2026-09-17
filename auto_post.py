"""
네이버 블로그 자동발행 스크립트 (로컬 실행 전용).

주의:
- 이 스크립트는 사용자 본인의 PC에서, 본인 계정으로만 사용해야 합니다.
- 네이버 SmartEditor는 클래스명이 배포마다 바뀔 수 있어(해시된 CSS 클래스),
  아래 SELECTORS 값이 실제 화면과 안 맞을 수 있습니다. 안 맞으면
  `python auto_post.py --inspect` 로 DOM을 덤프해서 같이 고쳐야 합니다.
- config.json 의 dry_run 이 true 인 동안은 마지막 '발행' 확정 클릭을 하지 않고
  멈춥니다. 화면을 직접 확인한 뒤 수동으로 발행 버튼을 눌러주세요.
"""

import argparse
import json
import re
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
)
from webdriver_manager.chrome import ChromeDriverManager

# Windows Smart App Control이 selenium이 자체 실행하는 selenium-manager.exe를
# 차단하는 환경이 있어(평판 낮은 소형 바이너리), 구글이 정식 서명한
# chromedriver를 webdriver-manager로 받아 명시적으로 지정해 우회한다.
DEFAULT_CHROME_BINARY = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

BASE_DIR = Path(__file__).resolve().parent
POSTS_DIR = BASE_DIR / "posts"
CONFIG_PATH = BASE_DIR / "config.json"

# 실제 화면 구조 확인 후 계속 보정해나갈 선택자 후보들.
# (naver.com 접근이 안 되는 환경에서 작성했기 때문에 최초 실행 시 검증 필수)
SELECTORS = {
    "iframe": "mainFrame",
    # 확인됨: .se-title-text 자체는 wrapper div라 클릭은 되지만 타이핑은 안 먹는다.
    # 실제 타이핑 대상은 그 안의 <p class="se-text-paragraph"> 자식.
    "title_candidates": [
        ".se-section-documentTitle .se-text-paragraph",
    ],
    # 아래는 모두 확인됨(2026-09-17, debug_dom_iframe_1/2.html). 해시된 CSS 클래스
    # (예: publish_btn__v_kS9) 대신 배포가 바뀌어도 안 변할 가능성이 높은
    # data-click-area / data-testid / id / aria-label 속성을 우선 사용한다.
    "publish_open_btn": "button[data-click-area='tpb.publish']",
    "publish_confirm_btn": "button[data-testid='seOnePublishBtn']",
    "category_open_btn": "button[aria-label='카테고리 목록 버튼']",
    "tag_input": "#tag-input",
    "continue_writing_cancel": "button.se-popup-button-cancel, .se-popup-dim-white button",
}


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        sys.exit(
            f"[설정 없음] {CONFIG_PATH} 파일이 없습니다. "
            f"config.example.json 을 복사해서 config.json 으로 만들고 blog_id 등을 채워주세요."
        )
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def parse_draft(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not m:
        sys.exit(f"[형식 오류] {path} 에 --- frontmatter --- 블록이 없습니다.")
    front, body = m.group(1), m.group(2).strip()
    meta = {}
    for line in front.splitlines():
        if ":" not in line:
            continue
        key, val = line.split(":", 1)
        meta[key.strip()] = val.strip()
    meta["_body"] = body
    meta["_path"] = path
    return meta


def find_next_draft() -> Path | None:
    candidates = sorted(POSTS_DIR.glob("*.md"))
    for p in candidates:
        meta = parse_draft(p)
        if meta.get("status", "draft") == "draft":
            return p
    return None


def mark_published(path: Path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^status:\s*draft\s*$", "status: published", text)
    path.write_text(text, encoding="utf-8")


def build_driver(profile_dir: Path, config: dict) -> webdriver.Chrome:
    options = Options()
    options.binary_location = config.get("chrome_binary", DEFAULT_CHROME_BINARY)
    options.add_argument(f"--user-data-dir={profile_dir}")
    options.add_argument("--profile-directory=Default")
    options.add_argument("--start-maximized")
    # 자동화 표시(Chrome이 자동화 제어중이라는 배너 등) 최소화
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    if config.get("headless", False):
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
    driver_path = ChromeDriverManager().install()
    service = Service(executable_path=driver_path)
    return webdriver.Chrome(service=service, options=options)


def is_logged_in(driver, blog_id: str) -> bool:
    driver.get(f"https://blog.naver.com/{blog_id}?Redirect=Write&")
    time.sleep(2)
    return "nid.naver.com" not in driver.current_url


def ensure_logged_in(driver, blog_id: str, config: dict, max_attempts: int = 5):
    for attempt in range(1, max_attempts + 1):
        if is_logged_in(driver, blog_id):
            return
        if config.get("headless", False):
            sys.exit(
                "[로그인 필요] 창 없이(headless) 실행 중인데 로그인 세션이 없습니다.\n"
                "config.json 의 headless 를 false 로 잠깐 바꿔서 한 번 로그인한 뒤 다시 headless 로 돌려주세요."
            )
        input(
            f"\n[로그인 필요 - {attempt}/{max_attempts}] 지금 뜬 크롬 창에서 네이버에 직접 로그인해주세요.\n"
            "(아이디/비번 입력 후 '새로운 기기 인증' 문자/이메일이 뜨면 그것까지 완료)\n"
            "로그인 후 실제로 네이버 블로그 화면이 보이는지 확인한 다음, 이 터미널로 돌아와서 Enter 를 눌러주세요..."
        )
    if not is_logged_in(driver, blog_id):
        sys.exit(f"[로그인 실패] {max_attempts}번 시도했지만 로그인 상태를 확인하지 못했습니다.")


def normalize_category_text(s: str) -> str:
    """카테고리 표시 텍스트를 비교용으로 정규화.

    - '하위 카테고리'라는 스크린리더 전용 라벨이 textContent에 섞여 들어온다.
    - 사람마다 '허깅페이스 논문' / '허깅페이스논문' 처럼 띄어쓰기를 다르게 넣거나
      &nbsp;(U+00A0)를 섞어 쓰기도 한다.
    둘 다 무시하고 순수 글자만 비교한다.
    """
    s = s.replace("하위 카테고리", "")
    s = s.replace("\xa0", "").replace(" ", "")
    return s.strip()


def try_click(driver, css_list: str, timeout=5):
    end = time.time() + timeout
    last_err = None
    for css in [c.strip() for c in css_list.split(",")]:
        try:
            el = WebDriverWait(driver, timeout).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, css))
            )
            el.click()
            return el
        except Exception as e:  # noqa: BLE001
            last_err = e
    if last_err:
        raise last_err


def dump_debug(driver, label: str):
    out = BASE_DIR / "debug_dom.html"
    out.write_text(driver.page_source, encoding="utf-8")
    print(f"[디버그] '{label}' 단계에서 요소를 못 찾았습니다. {out} 에 현재 DOM을 저장했습니다.")
    print("        이 파일 내용을 채팅에 붙여주시면 선택자를 같이 고칠 수 있어요.")


def write_post(driver, meta: dict, config: dict, dry_run: bool):
    blog_id = config["blog_id"]
    driver.get(f"https://blog.naver.com/{blog_id}?Redirect=Write&")
    time.sleep(3)

    try:
        WebDriverWait(driver, 15).until(
            EC.frame_to_be_available_and_switch_to_it((By.ID, SELECTORS["iframe"]))
        )
    except TimeoutException:
        dump_debug(driver, "iframe 진입")
        raise

    # "작성 중인 글이 있습니다. 이어서 작성하시겠습니까?" 팝업이 뜨면 취소(새 글로 시작).
    # 이 팝업도 mainFrame iframe 안에 있으므로 iframe 진입 이후에 처리해야 한다.
    try:
        try_click(driver, SELECTORS["continue_writing_cancel"], timeout=3)
        time.sleep(1)
    except Exception:  # noqa: BLE001
        pass  # 팝업이 없으면 그냥 진행

    # 제목 입력
    # 주의: SmartEditor의 <p class="se-text-paragraph">는 내용이 비어있을 때
    # 사실상 크기가 0이라 Selenium의 일반 click()/send_keys()가
    # "element not interactable"로 실패한다. JS로 클릭해 포커스를 준 다음,
    # 실제로 포커스된 노드(active_element)에 입력하는 방식으로 우회한다.
    try:
        title_el = None
        for css in SELECTORS["title_candidates"]:
            try:
                title_el = WebDriverWait(driver, 5).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, css))
                )
                break
            except TimeoutException:
                continue
        if title_el is None:
            raise NoSuchElementException("title element not found")
        driver.execute_script("arguments[0].click();", title_el)
        active = driver.switch_to.active_element
        active.send_keys(meta["title"])
        active.send_keys(Keys.RETURN)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "제목 입력")
        raise

    # 본문 입력 (제목에서 Enter 치면 보통 본문으로 포커스가 넘어간다)
    try:
        body_el = driver.switch_to.active_element
        for line in meta["_body"].split("\n"):
            body_el.send_keys(line)
            body_el.send_keys(Keys.RETURN)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "본문 입력")
        raise

    # 발행 버튼도 mainFrame iframe 안에 있으므로 default_content()로 빠져나가면 안 된다.
    # 발행 레이어 열기
    try:
        try_click(driver, SELECTORS["publish_open_btn"], timeout=10)
        time.sleep(1.5)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "발행 버튼 열기")
        raise

    # 카테고리 선택 (frontmatter의 "대분류 > 중분류" 중 마지막 항목으로 클릭)
    category = meta.get("category", "").strip()
    if category:
        leaf = category.split(">")[-1].strip()
        leaf_norm = normalize_category_text(leaf)
        try:
            try_click(driver, SELECTORS["category_open_btn"], timeout=5)
            time.sleep(0.5)
            # 카테고리 이름에 사람마다 띄어쓰기/줄바꿈(&nbsp;)을 다르게 넣는 경우가 있어
            # 공백을 다 제거하고 비교한다. (확인됨: debug_dom.html)
            candidates = WebDriverWait(driver, 5).until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, "[data-testid^='categoryItemText_']")
                )
            )
            target = None
            for el in candidates:
                text = el.get_attribute("textContent") or ""
                if normalize_category_text(text) == leaf_norm:
                    target = el
                    break
            if target is None:
                raise NoSuchElementException(f"category '{leaf}' not in dropdown")
            # 실제 클릭 대상은 텍스트가 든 <span>이 아니라 그걸 감싸는 <label role="button">.
            label = target.find_element(By.XPATH, "./ancestor::label")
            driver.execute_script("arguments[0].click();", label)
            time.sleep(0.3)
        except Exception:  # noqa: BLE001
            dump_debug(driver, f"카테고리 선택 ('{leaf}')")
            print(f"[경고] 카테고리 '{leaf}' 자동 선택 실패 - 직접 선택해주세요.")

    # 태그 입력
    tags = [t.strip() for t in meta.get("tags", "").split(",") if t.strip()]
    if tags:
        try:
            tag_el = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, SELECTORS["tag_input"]))
            )
            for tag in tags:
                tag_el.send_keys(tag)
                tag_el.send_keys(Keys.RETURN)
                time.sleep(0.2)
        except Exception:  # noqa: BLE001
            dump_debug(driver, "태그 입력")
            print("[경고] 태그 자동 입력 실패 - 직접 입력해주세요.")

    if dry_run:
        print(
            "\n[DRY RUN] 제목/본문/카테고리/태그 입력까지 완료했습니다.\n"
            "화면을 직접 확인한 뒤 최종 발행은 직접 눌러주세요.\n"
            "config.json 의 dry_run 을 false 로 바꾸면 최종 발행까지 자동 진행합니다."
        )
        return False

    # 실제 공개 발행은 되돌리기 어려운 동작이므로, dry_run=false 여도 한 번 더
    # 사람이 직접 확인하게 한다.
    answer = input(f"\n[최종 확인] '{meta['title']}' 글을 지금 실제로 공개 발행할까요? (예/아니오): ")
    if answer.strip() not in ("예", "y", "Y", "yes", "Yes"):
        print("[취소] 발행을 취소했습니다.")
        return False

    try:
        confirm_btn = WebDriverWait(driver, 15).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, SELECTORS["publish_confirm_btn"])
            )
        )
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", confirm_btn)
        time.sleep(0.3)
        driver.execute_script("arguments[0].click();", confirm_btn)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "최종 발행 확정")
        raise

    # 클릭 직후 바로 브라우저를 닫으면 실제 발행 요청이 끝나기 전에 끊길 수 있다.
    # SmartEditor는 mainFrame(iframe) 안에서 SPA 라우팅으로 동작해서 최상위
    # 프레임의 URL은 안 바뀐다. iframe 자신의 window.location.href 가
    # PostWriteForm.naver 에서 벗어나는지로 실제 발행 여부를 확인한다.
    # (확인됨: 블로그 목록 페이지(PostList.naver)는 iframe이 10개나 있고 사이드바에
    # 카테고리 이름이 그대로 노출돼 있어 제목 텍스트 매칭으로는 오탐이 났다.)
    published = False
    for _ in range(20):
        time.sleep(1)
        try:
            alert = driver.switch_to.alert
            print(f"[알림창] 브라우저 alert 발견: {alert.text!r} -> 확인 처리")
            alert.accept()
            time.sleep(1)
            continue
        except Exception:  # noqa: BLE001
            pass
        try:
            current = driver.execute_script("return window.location.href;")
        except Exception:  # noqa: BLE001
            current = ""
        if "PostWriteForm" not in current:
            published = True
            break

    if not published:
        dump_debug(driver, "발행 후 반영 확인")
        print(f"[디버그] 마지막으로 확인된 iframe URL: {current!r}")
        print(
            f"[경고] 발행 버튼은 눌렀지만 화면이 넘어가는 것을 확인하지 못했습니다.\n"
            "        브라우저/블로그에서 직접 확인해주세요 (초안 상태는 draft로 유지합니다)."
        )
        return False

    print(f"[완료] '{meta['title']}' 발행 확인됨 (에디터 화면이 글쓰기 폼에서 벗어남).")
    return True


def main():
    parser = argparse.ArgumentParser(description="네이버 블로그 자동발행 (로컬 전용)")
    parser.add_argument("--file", type=str, help="특정 draft 파일 경로 지정 (기본: posts/ 에서 status:draft인 첫 파일)")
    parser.add_argument("--inspect", action="store_true", help="글쓰기 화면을 열고 DOM만 덤프한 뒤 종료")
    args = parser.parse_args()

    config = load_config()
    profile_dir = (BASE_DIR / config["chrome_profile_dir"]).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    draft_path = Path(args.file) if args.file else find_next_draft()
    if not args.inspect and draft_path is None:
        sys.exit("[대상 없음] posts/ 폴더에 status: draft 인 파일이 없습니다.")

    driver = build_driver(profile_dir, config)
    try:
        ensure_logged_in(driver, config["blog_id"], config)

        if args.inspect:
            driver.get(f"https://blog.naver.com/{config['blog_id']}?Redirect=Write&")
            time.sleep(3)
            n = 0
            while True:
                n += 1
                try:
                    driver.switch_to.default_content()
                    WebDriverWait(driver, 15).until(
                        EC.frame_to_be_available_and_switch_to_it((By.ID, SELECTORS["iframe"]))
                    )
                    time.sleep(0.5)
                    out = BASE_DIR / f"debug_dom_iframe_{n}.html"
                    out.write_text(driver.page_source, encoding="utf-8")
                    print(f"[디버그] {n}번째 캡처 -> {out}")
                except TimeoutException:
                    print("[디버그] iframe(mainFrame) 진입 실패")
                cmd = input(
                    "브라우저에서 화면을 클릭/조작한 뒤 Enter 를 누르면 다시 캡처합니다. "
                    "끝내려면 q + Enter: "
                )
                if cmd.strip().lower() == "q":
                    break
            return

        meta = parse_draft(draft_path)
        published = write_post(driver, meta, config, dry_run=config.get("dry_run", True))
        if published:
            mark_published(draft_path)
    finally:
        if config.get("dry_run", True) or args.inspect:
            input("\n브라우저를 닫으려면 Enter 를 누르세요 (직접 확인 후 닫아도 됩니다)...")
        driver.quit()


if __name__ == "__main__":
    main()
