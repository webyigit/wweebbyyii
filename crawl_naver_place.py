"""네이버 플레이스에서 별점·리뷰수·메뉴·가격·사진을 받아와 페이지 데이터에 채웁니다.

사장님 PC에서 돌리는 스크립트입니다 (로컬 크롬 + Selenium).

    python crawl_naver_place.py                  # 별점 · 리뷰수 · 메뉴/가격
    python crawl_naver_place.py --photos         # 사진까지 내려받기
    python crawl_naver_place.py --only 특삼겹 금고깃집  # 특정 가게만
    python crawl_naver_place.py --limit 5        # 앞 5곳만 (시험 삼아)
    python crawl_naver_place.py --dry-run        # 파일은 그대로, 결과만 출력

동작 방식:

  1. m.search.naver.com 에서 "<가게이름> 마곡" 으로 찾아 플레이스 ID를 얻습니다.
  2. m.place.naver.com/restaurant/<id>/home 과 /menu/list 를 열어
     페이지가 들고 있는 데이터 뭉치(window.__APOLLO_STATE__)를 통째로 읽습니다.
     CSS 클래스명을 짚지 않기 때문에 네이버가 화면을 바꿔도 잘 안 깨집니다.
     혹시 그 뭉치가 없으면 화면 글자에서 정규식으로 주워 담는 방법으로 물러섭니다.
  3. 받은 값을 index.html 의 places-data 블록에 병합합니다.
     직접 써 둔 소개글(note)과 이미 있는 값은 건드리지 않습니다.

주의:

  - 네이버 화면을 읽는 방식이라 약관상 회색지대입니다. auto_post.py 와 같은 수준으로
    보시면 됩니다. 한 가게당 몇 초씩 쉬면서 천천히 돕니다. 하루에 몇 번씩 돌리지 마세요.
  - --photos 로 받은 사진은 **가게나 다른 이용자가 올린 사진**입니다. 공개 페이지에
    그대로 쓰면 저작권 문제가 생길 수 있습니다. 직접 찍은 사진을 쓰시는 걸 권합니다.
    photos/ 에 같은 이름 파일이 이미 있으면 덮어쓰지 않습니다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import fetch_places as fp

ROOT = Path(__file__).resolve().parent
PHOTO_DIR = ROOT / "docs" / "magok-matjip" / "photos"

SEARCH_URL = "https://m.search.naver.com/search.naver?query={q}"
HOME_URL = "https://m.place.naver.com/restaurant/{pid}/home"
MENU_URL = "https://m.place.naver.com/restaurant/{pid}/menu/list"

PLACE_ID_RE = re.compile(r"place\.naver\.com/(?:restaurant|place)/(\d+)")
PRICE_RE = re.compile(r"(\d[\d,]*)\s*원?")

# APOLLO_STATE 안에서 찾아볼 키 이름들. 네이버가 이름을 조금씩 바꿔 와서 여러 개를 본다.
RATING_KEYS = ("visitorReviewsScore", "visitorReviewScore", "reviewScore", "score")
REVIEW_KEYS = ("visitorReviewsTotal", "visitorReviewCount", "visitorReviewsCount",
               "totalReviewCount", "reviewCount")


# --------------------------------------------------------------------- 유틸

def to_float(value) -> float | None:
    try:
        f = float(str(value).strip().replace(",", ""))
    except (TypeError, ValueError):
        return None
    return f if 0 < f <= 5 else None


def to_int(value) -> int | None:
    try:
        return int(str(value).strip().replace(",", ""))
    except (TypeError, ValueError):
        return None


def to_price(value) -> int | None:
    """'16,000원' / '16000' / 16000 -> 16000. '변동' 같은 건 버린다."""
    if isinstance(value, (int, float)):
        n = int(value)
        return n if 100 <= n <= 1_000_000 else None
    match = PRICE_RE.search(str(value or ""))
    if not match:
        return None
    n = to_int(match.group(1))
    return n if n and 100 <= n <= 1_000_000 else None


def walk(node):
    """중첩된 dict/list 를 전부 훑어 dict 만 하나씩 내놓는다."""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from walk(v)


# --------------------------------------------------------------------- 파싱

def pick_rating(state) -> tuple[float | None, int | None]:
    """가장 리뷰가 많은(= 그 가게 본체일 가능성이 큰) 항목의 점수를 고른다."""
    best = (None, None)
    best_reviews = -1
    for node in walk(state):
        rating = next((to_float(node[k]) for k in RATING_KEYS
                       if k in node and to_float(node[k]) is not None), None)
        if rating is None:
            continue
        reviews = next((to_int(node[k]) for k in REVIEW_KEYS
                        if k in node and to_int(node[k]) is not None), None)
        if (reviews or 0) > best_reviews:
            best, best_reviews = (rating, reviews), (reviews or 0)
    return best


def pick_menus(state, limit: int = 6) -> list[dict]:
    """메뉴 이름 + 가격. 대표 메뉴가 표시돼 있으면 그쪽을 앞으로 올린다."""
    found, seen = [], set()
    for node in walk(state):
        name = node.get("name") or node.get("menuName")
        if not isinstance(name, str) or not name.strip():
            continue
        if "price" not in node and "menuPrice" not in node:
            continue
        price = to_price(node.get("price", node.get("menuPrice")))
        if price is None:
            continue
        name = re.sub(r"\s+", " ", name).strip()
        if len(name) > 40 or name in seen:
            continue
        seen.add(name)
        found.append({
            "name": name,
            "price": price,
            "_rec": bool(node.get("isRecommended") or node.get("recommend")),
        })
    found.sort(key=lambda m: not m["_rec"])
    return [{"name": m["name"], "price": m["price"]} for m in found[:limit]]


def pick_photo(state) -> str:
    for node in walk(state):
        for key in ("imageUrl", "thumbnailUrl", "url", "origin"):
            url = node.get(key)
            if isinstance(url, str) and url.startswith("http") \
                    and re.search(r"\.(jpe?g|png)", url, re.I) \
                    and "pstatic.net" in url:
                return url
    return ""


def fallback_from_text(text: str) -> tuple[float | None, int | None]:
    """APOLLO_STATE 가 없을 때 화면 글자에서 점수만이라도 건진다."""
    rating = None
    m = re.search(r"별점\s*([0-5](?:\.\d)?)", text) or re.search(r"([0-5]\.\d)\s*/\s*5", text)
    if m:
        rating = to_float(m.group(1))
    reviews = None
    m = re.search(r"방문자\s*리뷰\s*([\d,]+)", text)
    if m:
        reviews = to_int(m.group(1))
    return rating, reviews


# --------------------------------------------------------------------- 브라우저

def make_driver(cfg: dict):
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        sys.exit("selenium 이 필요합니다: pip install -r requirements.txt")

    options = Options()
    binary = cfg.get("chrome_binary")
    if binary and Path(binary).exists():
        options.binary_location = binary
    if cfg.get("headless"):
        options.add_argument("--headless=new")
    options.add_argument("--window-size=430,900")   # 모바일 화면 폭
    options.add_argument("--lang=ko-KR")
    # 로그인 세션은 필요 없다. auto_post.py 프로필을 건드리지 않으려고 일부러 안 쓴다.
    return webdriver.Chrome(options=options)


def apollo(driver):
    try:
        return driver.execute_script(
            "return window.__APOLLO_STATE__ || window.__PLACE_STATE__ || null;")
    except Exception:
        return None


def find_place_id(driver, name: str) -> str:
    driver.get(SEARCH_URL.format(q=urllib.parse.quote(f"{name} 마곡")))
    time.sleep(2.5)
    match = PLACE_ID_RE.search(driver.page_source)
    return match.group(1) if match else ""


def scrape_place(driver, pid: str, want_photo: bool) -> dict:
    out = {"rating": None, "reviews": None, "menus": [], "photo_url": ""}

    driver.get(HOME_URL.format(pid=pid))
    time.sleep(3)
    state = apollo(driver)
    if state:
        out["rating"], out["reviews"] = pick_rating(state)
        if want_photo:
            out["photo_url"] = pick_photo(state)
    else:
        out["rating"], out["reviews"] = fallback_from_text(driver.page_source)

    time.sleep(1.5)
    driver.get(MENU_URL.format(pid=pid))
    time.sleep(3)
    menu_state = apollo(driver)
    if menu_state:
        out["menus"] = pick_menus(menu_state)
    return out


def save_photo(url: str, name: str) -> str:
    """photos/<가게이름>.jpg 로 저장. 이미 있으면 건드리지 않는다."""
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|]', "_", name).strip()
    for existing in PHOTO_DIR.glob(f"{safe}.*"):
        return f"photos/{existing.name}"      # 이미 있는 사진 우선
    ext = ".png" if ".png" in url.lower() else ".jpg"
    target = PHOTO_DIR / f"{safe}{ext}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0", "Referer": "https://m.place.naver.com/"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        target.write_bytes(resp.read())
    return f"photos/{target.name}"


# --------------------------------------------------------------------- 메인

def main() -> None:
    ap = argparse.ArgumentParser(description="네이버 플레이스 별점·메뉴·사진 수집")
    ap.add_argument("--photos", action="store_true", help="대표 사진도 내려받기")
    ap.add_argument("--only", nargs="*", metavar="이름", help="이 이름이 들어간 가게만")
    ap.add_argument("--limit", type=int, help="앞에서 N곳만")
    ap.add_argument("--force", action="store_true", help="이미 값이 있어도 다시 받기")
    ap.add_argument("--dry-run", action="store_true", help="파일은 그대로, 결과만 출력")
    args = ap.parse_args()

    if args.photos:
        print("! --photos 로 받는 사진은 가게나 다른 이용자가 올린 사진입니다.")
        print("  공개 페이지에 쓰기 전에 사용해도 되는 사진인지 확인하세요.\n")

    places = fp.read_existing()
    todo = places
    if args.only:
        todo = [p for p in todo if any(k in p["name"] for k in args.only)]
    if not args.force:
        todo = [p for p in todo if p.get("rating") is None or not p.get("menus")]
    if args.limit:
        todo = todo[:args.limit]

    if not todo:
        print("받아올 곳이 없습니다. 다시 받으려면 --force 를 붙이세요.")
        return

    print(f"대상 {len(todo)}곳 / 전체 {len(places)}곳\n")
    cfg = fp.load_config()
    driver = make_driver(cfg)
    ok = fail = 0

    try:
        for i, place in enumerate(todo, 1):
            name = place["name"]
            print(f"[{i}/{len(todo)}] {name}", end=" … ", flush=True)
            try:
                pid = find_place_id(driver, name)
                if not pid:
                    print("플레이스를 못 찾음")
                    fail += 1
                    continue
                got = scrape_place(driver, pid, args.photos)

                bits = []
                if got["rating"] is not None:
                    place["rating"] = got["rating"]
                    place["src"] = "naver"
                    bits.append(f"별점 {got['rating']}")
                if got["reviews"] is not None:
                    place["reviews"] = got["reviews"]
                    bits.append(f"리뷰 {got['reviews']:,}")
                if got["menus"]:
                    place["menus"] = got["menus"]
                    bits.append(f"메뉴 {len(got['menus'])}개")
                if got["photo_url"]:
                    try:
                        place["photo"] = save_photo(got["photo_url"], name)
                        bits.append("사진")
                    except Exception as exc:
                        bits.append(f"사진 실패({exc})")

                print(", ".join(bits) if bits else "건진 게 없음")
                ok += 1 if bits else 0
                fail += 0 if bits else 1
            except Exception as exc:
                print(f"오류: {exc}")
                fail += 1
            time.sleep(3)   # 가게 사이 간격
    finally:
        driver.quit()

    print(f"\n성공 {ok}곳, 실패 {fail}곳")
    rated = sum(1 for p in places if isinstance(p.get("rating"), (int, float)))
    menued = sum(1 for p in places if p.get("menus"))
    print(f"전체 기준 — 별점 {rated}곳, 메뉴 {menued}곳")

    if args.dry_run:
        print("\n--dry-run 이라 파일은 그대로 둡니다.")
        for p in places:
            if p.get("rating") is not None or p.get("menus"):
                print(f"  {p['name']}: {p.get('rating')} / {p.get('menus')}")
        return

    fp.write_page(places)
    print("\n페이지를 브라우저로 열어 확인한 뒤 커밋하세요.")


if __name__ == "__main__":
    main()
