"""네이버 플레이스에서 별점·리뷰수·메뉴·가격·사진을 받아와 페이지 데이터에 채웁니다.

사장님 PC에서 돌리는 스크립트입니다 (로컬 크롬 + Selenium).

    python crawl_naver_place.py                  # 별점 · 리뷰수 · 인기메뉴/가격 · 좌표
    python crawl_naver_place.py --photos         # 사진까지 (페이지에는 안 나옴)
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
  - 사진은 --photos 를 붙일 때만 받습니다. 페이지에서 사진 영역을 뺐기 때문에
    기본으로는 받지 않습니다. 받더라도 남이 올린 사진이라 외부에 공개하거나 다시
    배포하면 저작권 문제가 생길 수 있습니다.
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


def pick_menus(state, limit: int = 8) -> list[dict]:
    """메뉴 이름 + 가격. 대표 메뉴가 표시돼 있으면 그쪽을 앞으로 올린다.

    페이지는 다섯 개까지 보여 주지만, 가격이 없는 메뉴가 섞여 걸러질 수 있어
    넉넉히 받아 둔다.
    """
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


# 대표 사진으로 쓰기엔 곤란한 것들 (프로필 아이콘, 지도 썸네일, 빈 이미지 등)
BAD_IMAGE = re.compile(
    r"(profile|blank|noimage|no_image|logo|icon|sprite|map|static\.naver)", re.I)
IMAGE_KEYS = ("imageUrl", "thumbnailUrl", "thumbUrl", "origin", "imgUrl", "url")


def upsize(url: str) -> str:
    """네이버 썸네일 주소의 크기 지정을 걷어내 원본에 가깝게 만든다.

    .../abcd_01.jpg?type=f320_320  ->  .../abcd_01.jpg?type=w1500
    """
    base = url.split("?")[0]
    if "pstatic.net" not in base:
        return url
    return base + "?type=w1500"


def pick_photos(state, limit: int = 6) -> list[str]:
    """대표 사진 후보를 그럴듯한 순서로 모은다.

    한 장만 집으면 로고나 아이콘을 물고 오는 경우가 있어서 여러 장을 받아 두고,
    실제로 내려받아 보고 쓸 만한 것을 고른다.
    """
    scored, seen = [], set()
    for node in walk(state):
        typename = str(node.get("__typename", ""))
        for key in IMAGE_KEYS:
            url = node.get(key)
            if not isinstance(url, str) or not url.startswith("http"):
                continue
            if not re.search(r"\.(jpe?g|png)", url, re.I):
                continue
            if "pstatic.net" not in url or BAD_IMAGE.search(url):
                continue
            clean = upsize(url)
            if clean in seen:
                continue
            seen.add(clean)

            # 가게 대표 이미지에 가까울수록 앞으로
            score = 0
            if re.search(r"(place|restaurant|business|represent)", typename, re.I):
                score -= 3
            if key in ("imageUrl", "origin"):
                score -= 2
            if re.search(r"(review|user)", typename, re.I):
                score += 2
            scored.append((score, clean))

    scored.sort(key=lambda x: x[0])
    return [u for _, u in scored[:limit]]


def pick_coords(state) -> tuple[float | None, float | None]:
    """플레이스 데이터에서 위경도를 찾는다. 네이버는 x=경도, y=위도 로 준다."""
    for node in walk(state):
        x, y = node.get("x"), node.get("y")
        if x is None or y is None:
            coord = node.get("coordinate") or node.get("coord")
            if isinstance(coord, dict):
                x, y = coord.get("x"), coord.get("y")
        try:
            lng, lat = float(x), float(y)
        except (TypeError, ValueError):
            continue
        # 서울 강서구 언저리인지 대충 확인 — 엉뚱한 숫자를 좌표로 오인하지 않게
        if 126.5 <= lng <= 127.3 and 37.3 <= lat <= 37.8:
            return lat, lng
    return None, None


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
    out = {"rating": None, "reviews": None, "menus": [], "photo_urls": [],
           "lat": None, "lng": None}

    driver.get(HOME_URL.format(pid=pid))
    time.sleep(3)
    state = apollo(driver)
    if state:
        out["rating"], out["reviews"] = pick_rating(state)
        out["lat"], out["lng"] = pick_coords(state)
        if want_photo:
            out["photo_urls"] = pick_photos(state)
    else:
        out["rating"], out["reviews"] = fallback_from_text(driver.page_source)

    time.sleep(1.5)
    driver.get(MENU_URL.format(pid=pid))
    time.sleep(3)
    menu_state = apollo(driver)
    if menu_state:
        out["menus"] = pick_menus(menu_state)
    return out


MIN_BYTES = 12_000        # 이보다 작으면 아이콘이나 빈 이미지로 본다
MAGIC = (b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n")


def save_photo(urls: list[str], name: str) -> str:
    """후보를 순서대로 받아 보고 쓸 만한 첫 장을 저장한다.

    photos/ 에 같은 이름 파일이 이미 있으면 손대지 않는다 — 직접 넣은 사진이 이긴다.
    """
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r'[\\/:*?"<>|]', "_", name).strip()

    for existing in PHOTO_DIR.glob(f"{safe}.*"):
        if existing.suffix.lower() in (".jpg", ".jpeg", ".png"):
            return f"photos/{existing.name}"

    last_error = "후보 없음"
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://m.place.naver.com/",
            })
            with urllib.request.urlopen(req, timeout=20) as resp:
                blob = resp.read()
        except Exception as exc:
            last_error = str(exc)
            continue

        if len(blob) < MIN_BYTES:
            last_error = f"너무 작음({len(blob)}B)"
            continue
        if not blob.startswith(MAGIC):
            last_error = "이미지가 아님"
            continue

        ext = ".png" if blob.startswith(MAGIC[1]) else ".jpg"
        target = PHOTO_DIR / f"{safe}{ext}"
        target.write_bytes(blob)
        return f"photos/{target.name}"

    raise RuntimeError(last_error)


# --------------------------------------------------------------------- 메인

def main() -> None:
    ap = argparse.ArgumentParser(description="네이버 플레이스 별점·메뉴·사진 수집")
    ap.add_argument("--photos", action="store_true",
                    help="사진도 받기 (페이지에는 안 나옵니다)")
    ap.add_argument("--only", nargs="*", metavar="이름", help="이 이름이 들어간 가게만")
    ap.add_argument("--limit", type=int, help="앞에서 N곳만")
    ap.add_argument("--force", action="store_true", help="이미 값이 있어도 다시 받기")
    ap.add_argument("--dry-run", action="store_true", help="파일은 그대로, 결과만 출력")
    args = ap.parse_args()

    want_photo = args.photos
    if want_photo:
        print("* 사진은 네이버 플레이스에 올라온 것을 가져옵니다. 개인적으로 보는 용도로 쓰세요.")
        print("  지금 페이지는 사진을 보여주지 않습니다. photos/ 에 파일만 쌓입니다.\n")

    places = fp.read_existing()
    todo = places
    if args.only:
        todo = [p for p in todo if any(k in p["name"] for k in args.only)]
    if not args.force:
        todo = [p for p in todo
                if p.get("rating") is None or not p.get("menus")
                or p.get("lat") is None
                or (want_photo and not p.get("photo"))]
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
                got = scrape_place(driver, pid, want_photo)

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
                if got["lat"] is not None:
                    place["lat"], place["lng"] = got["lat"], got["lng"]
                    station = fp.nearest_station(got["lat"], got["lng"])
                    if station:
                        place["station"] = station
                    bits.append(f"좌표({station or '?'})")
                if got["photo_urls"]:
                    try:
                        place["photo"] = save_photo(got["photo_urls"], name)
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
