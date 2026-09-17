"""마곡 맛집 페이지(docs/magok-matjip/index.html)의 가게 데이터를 채워 넣는 스크립트.

두 군데에서 가져옵니다.

1. 네이버 지역검색 오픈API  (필수, 기본 동작)
   - https://developers.naver.com 에서 애플리케이션을 등록하고 "검색" API를 추가하면
     Client ID / Client Secret 이 나옵니다. 무료이고 하루 25,000회까지 됩니다.
   - 상호명 · 분류 · 도로명주소 · 전화번호를 정식으로 받아옵니다. 화면을 긁는 게 아니라
     공개 API라서 약관 문제가 없습니다.
   - 단, 이 API는 한 번 호출에 최대 5건만 돌려줍니다. 그래서 아래 QUERIES 처럼
     키워드를 여러 개 던져서 모으는 구조입니다.

2. 캐치테이블  (선택, --catchtable 옵션)
   - 캐치테이블은 공개 API가 없습니다. 그래서 auto_post.py 와 같은 방식으로
     로컬 크롬을 Selenium 으로 열어 검색 결과에 떠 있는 가게 예약 페이지 주소만 긁습니다.
   - 가게 이름과 /ct/shop/<슬러그> 링크만 읽고, 리뷰나 사진은 건드리지 않습니다.
   - 짧은 간격으로 반복 실행하지 마세요. 사이에 텀을 두고 하루 한 번이면 충분합니다.

사용법:

    python fetch_places.py                     # 네이버만
    python fetch_places.py --catchtable        # 네이버 + 캐치테이블
    python fetch_places.py --dry-run           # 파일을 고치지 않고 결과만 출력

인증 정보는 config.json 에 넣거나 환경변수로 줍니다.

    {
      "naver_client_id": "...",
      "naver_client_secret": "..."
    }

    또는  set NAVER_CLIENT_ID=...  /  set NAVER_CLIENT_SECRET=...
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PAGE = ROOT / "docs" / "magok-matjip" / "index.html"
CONFIG = ROOT / "config.json"

NAVER_LOCAL_API = "https://openapi.naver.com/v1/search/local.json"

# 지역검색 API는 한 번에 최대 5건이라 키워드를 나눠서 던진다.
# (키워드, 우리 페이지에서 쓸 카테고리) — 카테고리는 네이버 분류로 다시 덮어쓴다.
QUERIES = [
    ("마곡역 삼겹살", "meat"),
    ("마곡역 고깃집", "meat"),
    ("마곡나루역 고기집", "meat"),
    ("마곡 소고기", "meat"),
    ("마곡역 한식", "korean"),
    ("마곡역 국밥", "korean"),
    ("마곡역 칼국수", "korean"),
    ("마곡 백반", "korean"),
    ("마곡역 초밥", "japanese"),
    ("마곡역 돈까스", "japanese"),
    ("마곡 오마카세", "japanese"),
    ("마곡역 중국집", "chinese"),
    ("마곡역 짬뽕", "chinese"),
    ("마곡역 파스타", "western"),
    ("마곡역 피자", "western"),
    ("마곡 이탈리안", "western"),
    ("마곡역 카페", "cafe"),
    ("마곡역 베이커리", "cafe"),
    ("마곡 디저트카페", "cafe"),
    ("마곡역 이자카야", "bar"),
    ("마곡역 술집", "bar"),
    ("마곡 와인바", "bar"),
]

# 네이버 분류 문자열 -> 페이지 카테고리. 위에서부터 먼저 걸리는 것을 쓴다.
CATEGORY_RULES = [
    ("카페", "cafe"),
    ("베이커리", "cafe"),
    ("제과", "cafe"),
    ("디저트", "cafe"),
    ("도넛", "cafe"),
    ("이자카야", "bar"),
    ("술집", "bar"),
    ("바(BAR)", "bar"),
    ("호프", "bar"),
    ("포장마차", "bar"),
    ("와인", "bar"),
    ("육류,고기", "meat"),
    ("곱창", "meat"),
    ("닭갈비", "meat"),
    ("삼겹살", "meat"),
    ("일식", "japanese"),
    ("초밥", "japanese"),
    ("돈까스", "japanese"),
    ("일본식", "japanese"),
    ("중식", "chinese"),
    ("중국요리", "chinese"),
    ("양식", "western"),
    ("이탈리아", "western"),
    ("피자", "western"),
    ("멕시코", "western"),
    ("스테이크", "western"),
    ("한식", "korean"),
    ("분식", "korean"),
    ("국수", "korean"),
    ("해물", "korean"),
]

CT_SEARCH = (
    "https://app.catchtable.co.kr/ct/map/COMMON"
    "?showTabs=true&serviceType=INTEGRATION&keyword={q}&keywordSearch={q}"
)
CT_QUERIES = [
    "마곡역 맛집",
    "마곡나루역 맛집",
    "마곡동 맛집",
    "마곡나루역 모임 맛집",
    "마곡 오마카세",
    "마곡 이자카야",
]
CT_SHOP_RE = re.compile(r"catchtable\.co\.kr/ct/shop/([A-Za-z0-9_\-]+)")

TAG_RE = re.compile(r"<[^>]+>")
DATA_BLOCK_RE = re.compile(
    r'(<script type="application/json" id="places-data">\s*)(.*?)(\s*</script>)',
    re.DOTALL,
)


# --------------------------------------------------------------------------- 공통

def load_config() -> dict:
    if CONFIG.exists():
        try:
            return json.loads(CONFIG.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            sys.exit(f"config.json 을 읽을 수 없습니다: {exc}")
    return {}


def naver_keys(cfg: dict) -> tuple[str, str]:
    cid = os.environ.get("NAVER_CLIENT_ID") or cfg.get("naver_client_id", "")
    sec = os.environ.get("NAVER_CLIENT_SECRET") or cfg.get("naver_client_secret", "")
    if not cid or not sec:
        sys.exit(
            "네이버 API 키가 없습니다.\n"
            "  https://developers.naver.com 에서 애플리케이션을 등록하고 '검색' API를 추가한 뒤\n"
            "  config.json 에 naver_client_id / naver_client_secret 을 넣거나\n"
            "  환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 설정하세요."
        )
    return cid, sec


def strip_tags(text: str) -> str:
    """네이버가 상호명에 넣어 주는 <b> 강조 태그를 걷어낸다."""
    return TAG_RE.sub("", text).strip()


def guess_category(naver_category: str, fallback: str) -> str:
    for needle, cat in CATEGORY_RULES:
        if needle in naver_category:
            return cat
    return fallback


def short_where(road_address: str) -> str:
    """'서울특별시 강서구 마곡중앙로 55 1층' -> '강서구 마곡중앙로 55'."""
    if not road_address:
        return "마곡 일대"
    parts = road_address.split()
    if len(parts) >= 3 and parts[0].startswith("서울"):
        return " ".join(parts[1:4])
    return road_address


# --------------------------------------------------------------------------- 네이버

def naver_local(query: str, cid: str, secret: str, display: int = 5) -> list[dict]:
    url = NAVER_LOCAL_API + "?" + urllib.parse.urlencode(
        {"query": query, "display": display, "sort": "comment"}
    )
    req = urllib.request.Request(url)
    req.add_header("X-Naver-Client-Id", cid)
    req.add_header("X-Naver-Client-Secret", secret)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        print(f"  ! '{query}' 실패 (HTTP {exc.code}): {detail}", file=sys.stderr)
        return []
    except urllib.error.URLError as exc:
        print(f"  ! '{query}' 실패: {exc.reason}", file=sys.stderr)
        return []
    return body.get("items", [])


def collect_naver(cid: str, secret: str) -> dict[str, dict]:
    found: dict[str, dict] = {}
    for query, fallback in QUERIES:
        items = naver_local(query, cid, secret)
        print(f"  {query}: {len(items)}건")
        for item in items:
            name = strip_tags(item.get("title", ""))
            if not name:
                continue
            road = item.get("roadAddress", "").strip()
            addr = item.get("address", "").strip()
            key = name
            if key in found:
                continue
            found[key] = {
                "name": name,
                "cat": guess_category(item.get("category", ""), fallback),
                "menu": item.get("category", "").split(">")[-1].strip() or "음식점",
                "resv": False,
                "ct": "",
                "note": "",
                "where": short_where(road or addr),
                "addr": road or addr,
                "tel": item.get("telephone", "").strip(),
            }
        time.sleep(0.2)  # 예의상 텀
    return found


# --------------------------------------------------------------------------- 캐치테이블

def collect_catchtable(cfg: dict) -> dict[str, str]:
    """로컬 크롬으로 캐치테이블 검색 결과를 열어 가게명 -> 슬러그 를 모은다."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
    except ImportError:
        sys.exit("selenium 이 필요합니다: pip install -r requirements.txt")

    options = Options()
    profile = cfg.get("chrome_profile_dir")
    if profile:
        options.add_argument(f"--user-data-dir={Path(profile).resolve()}")
    binary = cfg.get("chrome_binary")
    if binary and Path(binary).exists():
        options.binary_location = binary
    if cfg.get("headless"):
        options.add_argument("--headless=new")
    options.add_argument("--window-size=1280,1600")

    slugs: dict[str, str] = {}
    driver = webdriver.Chrome(options=options)
    try:
        for query in CT_QUERIES:
            url = CT_SEARCH.format(q=urllib.parse.quote(query))
            driver.get(url)
            time.sleep(4)  # 목록이 그려질 때까지
            anchors = driver.find_elements(By.CSS_SELECTOR, "a[href*='/ct/shop/']")
            hits = 0
            for a in anchors:
                href = a.get_attribute("href") or ""
                match = CT_SHOP_RE.search(href)
                if not match:
                    continue
                label = (a.text or "").strip().splitlines()
                name = label[0].strip() if label else ""
                if not name:
                    continue
                slugs.setdefault(name, match.group(1))
                hits += 1
            print(f"  {query}: 링크 {hits}개")
            time.sleep(2)
    finally:
        driver.quit()
    return slugs


def match_slug(name: str, slugs: dict[str, str]) -> str:
    """상호명이 정확히 같지 않아도(지점명 유무) 이어 붙여 본다."""
    if name in slugs:
        return slugs[name]
    plain = name.replace(" ", "")
    for candidate, slug in slugs.items():
        other = candidate.replace(" ", "")
        if plain == other or plain in other or other in plain:
            return slug
    return ""


# --------------------------------------------------------------------------- 병합 / 쓰기

def read_existing() -> list[dict]:
    if not PAGE.exists():
        sys.exit(f"페이지를 찾을 수 없습니다: {PAGE}")
    match = DATA_BLOCK_RE.search(PAGE.read_text(encoding="utf-8"))
    if not match:
        sys.exit("index.html 안에서 places-data 블록을 찾지 못했습니다.")
    return json.loads(match.group(2))


def merge(existing: list[dict], fetched: dict[str, dict], slugs: dict[str, str]) -> list[dict]:
    """직접 써 둔 한 줄 소개(note)는 살리고, 주소·전화·분류는 새로 받은 값으로 채운다."""
    by_name = {p["name"]: p for p in existing}
    merged: list[dict] = []
    added = 0

    for place in existing:
        fresh = fetched.get(place["name"])
        if fresh:
            place["addr"] = fresh["addr"] or place.get("addr", "")
            place["tel"] = fresh["tel"] or place.get("tel", "")
            if not place.get("where") or place["where"] == "마곡 일대":
                place["where"] = fresh["where"]
        slug = match_slug(place["name"], slugs)
        if slug:
            place["ct"] = slug
            place["resv"] = True
        merged.append(place)

    for name, fresh in fetched.items():
        if name in by_name:
            continue
        slug = match_slug(name, slugs)
        if slug:
            fresh["ct"] = slug
            fresh["resv"] = True
        fresh["note"] = f"네이버 지도 기준 {fresh['menu']}. 소개글은 아직 안 썼습니다."
        merged.append(fresh)
        added += 1

    order = {c: i for i, c in enumerate(
        ["meat", "korean", "japanese", "chinese", "western", "cafe", "bar"]
    )}
    merged.sort(key=lambda p: (order.get(p["cat"], 99), not p["resv"], p["name"]))
    print(f"\n기존 {len(existing)}곳, 새로 붙은 곳 {added}곳 -> 합계 {len(merged)}곳")
    return merged


def dump_json(places: list[dict]) -> str:
    lines = ["["]
    for i, p in enumerate(places):
        row = json.dumps(p, ensure_ascii=False)
        lines.append("  " + row + ("," if i < len(places) - 1 else ""))
    lines.append("]")
    return "\n".join(lines)


def write_page(places: list[dict]) -> None:
    html = PAGE.read_text(encoding="utf-8")
    block = dump_json(places)
    html = DATA_BLOCK_RE.sub(
        lambda m: m.group(1) + block + m.group(3), html, count=1
    )
    PAGE.write_text(html, encoding="utf-8")
    print(f"{PAGE} 를 새로 썼습니다.")


def main() -> None:
    parser = argparse.ArgumentParser(description="마곡 맛집 페이지 데이터 수집")
    parser.add_argument("--catchtable", action="store_true",
                        help="로컬 크롬으로 캐치테이블 예약 링크도 함께 수집")
    parser.add_argument("--dry-run", action="store_true",
                        help="파일을 고치지 않고 결과만 출력")
    args = parser.parse_args()

    cfg = load_config()
    cid, secret = naver_keys(cfg)

    print("네이버 지역검색에서 가져오는 중…")
    fetched = collect_naver(cid, secret)
    print(f"네이버에서 {len(fetched)}곳을 받았습니다.")

    slugs: dict[str, str] = {}
    if args.catchtable:
        print("\n캐치테이블 검색 결과를 여는 중…")
        slugs = collect_catchtable(cfg)
        print(f"캐치테이블에서 예약 페이지 {len(slugs)}곳을 확인했습니다.")

    merged = merge(read_existing(), fetched, slugs)

    if args.dry_run:
        print("\n--dry-run 이라 파일은 그대로 둡니다. 결과 미리보기:\n")
        print(dump_json(merged))
        return

    write_page(merged)
    print("\n페이지를 브라우저로 열어 확인한 뒤 커밋하세요.")


if __name__ == "__main__":
    main()
