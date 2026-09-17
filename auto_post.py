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
    "title_candidates": [
        ".se-section-documentTitle .se-title-text",
        ".se-title-text",
    ],
    "body_candidates": [
        ".se-component-content .se-text-paragraph",
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
    driver_path = ChromeDriverManager().install()
    service = Service(executable_path=driver_path)
    return webdriver.Chrome(service=service, options=options)


def is_logged_in(driver, blog_id: str) -> bool:
    driver.get(f"https://blog.naver.com/{blog_id}?Redirect=Write&")
    time.sleep(2)
    return "nid.naver.com" not in driver.current_url


def ensure_logged_in(driver, blog_id: str, max_attempts: int = 5):
    for attempt in range(1, max_attempts + 1):
        if is_logged_in(driver, blog_id):
            return
        input(
            f"\n[로그인 필요 - {attempt}/{max_attempts}] 지금 뜬 크롬 창에서 네이버에 직접 로그인해주세요.\n"
            "(아이디/비번 입력 후 '새로운 기기 인증' 문자/이메일이 뜨면 그것까지 완료)\n"
            "로그인 후 실제로 네이버 블로그 화면이 보이는지 확인한 다음, 이 터미널로 돌아와서 Enter 를 눌러주세요..."
        )
    if not is_logged_in(driver, blog_id):
        sys.exit(f"[로그인 실패] {max_attempts}번 시도했지만 로그인 상태를 확인하지 못했습니다.")


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

    # 이어쓰기 팝업이 뜨면 취소(새 글로 시작)
    try:
        try_click(driver, SELECTORS["continue_writing_cancel"], timeout=3)
        time.sleep(1)
    except Exception:  # noqa: BLE001
        pass  # 팝업이 없으면 그냥 진행

    try:
        WebDriverWait(driver, 15).until(
            EC.frame_to_be_available_and_switch_to_it((By.ID, SELECTORS["iframe"]))
        )
    except TimeoutException:
        dump_debug(driver, "iframe 진입")
        raise

    # 제목 입력
    try:
        title_el = None
        for css in SELECTORS["title_candidates"]:
            try:
                title_el = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, css))
                )
                break
            except TimeoutException:
                continue
        if title_el is None:
            raise NoSuchElementException("title element not found")
        title_el.click()
        title_el.send_keys(meta["title"])
    except Exception:  # noqa: BLE001
        dump_debug(driver, "제목 입력")
        raise

    # 본문 입력 (제목에서 Enter 치면 본문으로 포커스 이동하는 경우가 많음)
    try:
        title_el.send_keys(Keys.RETURN)
        body_el = None
        for css in SELECTORS["body_candidates"]:
            try:
                body_el = WebDriverWait(driver, 5).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, css))
                )
                break
            except TimeoutException:
                continue
        if body_el is None:
            body_el = driver.switch_to.active_element
        for line in meta["_body"].split("\n"):
            body_el.send_keys(line)
            body_el.send_keys(Keys.RETURN)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "본문 입력")
        raise

    driver.switch_to.default_content()

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
        try:
            try_click(driver, SELECTORS["category_open_btn"], timeout=5)
            time.sleep(0.5)
            item = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable(
                    (By.XPATH, f"//*[normalize-space(text())='{leaf}']")
                )
            )
            item.click()
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

    try:
        try_click(driver, SELECTORS["publish_confirm_btn"], timeout=10)
    except Exception:  # noqa: BLE001
        dump_debug(driver, "최종 발행 확정")
        raise

    print(f"[완료] '{meta['title']}' 발행을 시도했습니다. 브라우저에서 실제 반영 여부를 확인해주세요.")
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
        ensure_logged_in(driver, config["blog_id"])

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
