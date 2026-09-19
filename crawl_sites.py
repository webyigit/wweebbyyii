"""네이버 말고 다른 사이트에서도 가게 정보를 긁어옵니다.

    python crawl_sites.py                 # 카카오맵 + 다이닝코드
    python crawl_sites.py --site kakao    # 카카오맵만
    python crawl_sites.py --site dining   # 다이닝코드만
    python crawl_sites.py --only 돼슐랭   # 이름이 들어간 가게만
    python crawl_sites.py --dry-run       # 파일은 그대로, 결과만 출력
    python crawl_sites.py --debug         # 못 읽었을 때 화면을 파일로 남김

왜 사이트를 나눠 두었나
-----------------------
- **카카오맵**  좌표·주소·별점·리뷰수. 가게마다 값이 하나로 고정돼 있어서 제일 믿을
  만합니다. **좌표가 들어와야 도보 시간이 계산됩니다.** 이 스크립트를 돌리는 가장 큰
  이유입니다.
- **다이닝코드**  메뉴와 가격. 점수도 있지만 다이닝코드 점수는 *검색어별로* 계산되는
  값이라 같은 가게가 목록에 따라 4.5/4.6 으로 다르게 나옵니다. 그래서 점수는
  카카오맵이 없을 때만 받아 두고, 화면에는 반드시 '다이닝코드' 라고 출처를 붙입니다.

받아온 값에는 어디서 왔는지(`src`)를 같이 적습니다. 출처마다 기준이 달라서, 출처
없이 섞어 놓으면 틀린 정보가 됩니다.

주의
----
- 짧은 간격으로 반복해 돌리지 마세요. 가게 사이에 텀을 둡니다.
- 이미 값이 있으면 건너뜁니다. 다시 받으려면 `--force`.
- 직접 써 둔 소개글(`note`)은 건드리지 않습니다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

import fetch_places as fp

ROOT = Path(__file__).resolve().parent
DEBUG_DIR = ROOT / "debug_sites"

# 우리가 다루는 역 근처인지 대충 확인합니다. 엉뚱한 동명이인 가게를 잡으면 좌표가
# 서울 밖으로 튀는데, 그걸 그대로 넣으면 도보 시간이 말도 안 되게 나옵니다.
#
# 범위를 마곡에 맞춰 박아 두면 역을 늘렸을 때 구로·서초 좌표를 전부 버리게 됩니다.
# 그래서 REGIONS 의 역들에서 만들어 냅니다. 역에서 이 거리 안이면 받아들입니다.
NEAR_KM = 3.0


def in_range(lat: float | None, lng: float | None) -> bool:
    if lat is None or lng is None:
        return False
    for slat, slng in fp.STATIONS.values():
        # 위도 1도 ≈ 111km, 이 위도에서 경도 1도 ≈ 88km
        dx = (lat - slat) * 111.0
        dy = (lng - slng) * 88.0
        if (dx * dx + dy * dy) ** 0.5 <= NEAR_KM:
            return True
    return False


def to_float(v) -> float | None:
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return f


def to_int(v) -> int | None:
    try:
        return int(re.sub(r"[^0-9]", "", str(v)))
    except (TypeError, ValueError):
        return None


def to_price(v) -> int | None:
    n = to_int(v)
    # 1,000원 미만이나 1,000만원 이상은 가격이 아니라 다른 숫자를 잘못 읽은 것
    if n is None or n < 1000 or n > 10_000_000:
        return None
    return n


def dump(driver, tag: str) -> None:
    DEBUG_DIR.mkdir(exist_ok=True)
    path = DEBUG_DIR / f"{tag}.html"
    try:
        path.write_text(driver.page_source, encoding="utf-8")
        print(f"      화면을 남겼습니다: {path}")
    except Exception as exc:
        print(f"      화면 저장 실패: {exc}")


# ------------------------------------------------------------------ 카카오맵

KAKAO_SEARCH = "https://m.map.kakao.com/actions/searchView?q={q}"
KAKAO_ID_RE = re.compile(r"/(?:place|placePage)/(\d{6,})")


def kakao_find_id(driver, name: str, hint: str, debug: bool) -> str:
    q = urllib.parse.quote(f"{name} {hint}".strip())
    driver.get(KAKAO_SEARCH.format(q=q))
    time.sleep(2.2)
    m = KAKAO_ID_RE.search(driver.page_source)
    if m:
        return m.group(1)
    # 지역명을 붙이면 못 찾는 가게가 있어서 이름만으로 한 번 더
    driver.get(KAKAO_SEARCH.format(q=urllib.parse.quote(name)))
    time.sleep(2.2)
    m = KAKAO_ID_RE.search(driver.page_source)
    if m:
        return m.group(1)
    if debug:
        dump(driver, f"kakao-search-{name}")
    return ""


def kakao_place(driver, pid: str, debug: bool) -> dict:
    """카카오맵 상세의 JSON 을 그대로 읽습니다."""
    driver.get(f"https://place.map.kakao.com/main/v/{pid}")
    time.sleep(1.6)
    raw = ""
    try:
        raw = driver.find_element("tag name", "pre").text
    except Exception:
        raw = driver.page_source
    try:
        data = json.loads(raw)
    except Exception:
        if debug:
            dump(driver, f"kakao-place-{pid}")
        return {}

    basic = data.get("basicInfo") or {}
    out: dict = {}

    lat = to_float(basic.get("wpointy") or (basic.get("position") or {}).get("lat"))
    lng = to_float(basic.get("wpointx") or (basic.get("position") or {}).get("lng"))
    # wpoint 는 카카오 좌표계라 값이 큽니다. WGS84 로 들어온 경우만 씁니다.
    if lat and lat > 90:
        lat = to_float((basic.get("position") or {}).get("lat"))
        lng = to_float((basic.get("position") or {}).get("lng"))
    if in_range(lat, lng):
        out["lat"], out["lng"] = lat, lng

    addr = (basic.get("address") or {})
    road = (addr.get("newaddr") or {}).get("newaddrfull") or ""
    if road:
        out["addr"] = road.strip()

    fb = basic.get("feedback") or {}
    score = to_float(fb.get("scoresum") and fb.get("scorecnt")
                     and fb["scoresum"] / fb["scorecnt"])
    if score is None:
        score = to_float(basic.get("score"))
    if score is not None and 0 < score <= 5:
        out["rating"] = round(score, 1)
        out["src"] = "kakao"
    cnt = to_int(fb.get("scorecnt"))
    if cnt:
        out["reviews"] = cnt

    phone = basic.get("phonenum") or ""
    if phone:
        out["tel"] = phone.strip()

    menus = []
    for m in (data.get("menuInfo") or {}).get("menuList") or []:
        nm = (m.get("menu") or "").strip()
        price = to_price(m.get("price"))
        if nm and price:
            menus.append({"name": nm, "price": price})
    if menus:
        out["menus"] = menus[:5]

    return out


# ---------------------------------------------------------------- 다이닝코드

DINING_SEARCH = "https://www.diningcode.com/list.dc?query={q}"
DINING_ID_RE = re.compile(r"profile\.php\?rid=([A-Za-z0-9]+)")


def dining_find_id(driver, name: str, hint: str, debug: bool) -> str:
    driver.get(DINING_SEARCH.format(q=urllib.parse.quote(f"{name} {hint}".strip())))
    time.sleep(2.5)
    m = DINING_ID_RE.search(driver.page_source)
    if m:
        return m.group(1)
    if debug:
        dump(driver, f"dining-search-{name}")
    return ""


def dining_place(driver, rid: str, debug: bool) -> dict:
    driver.get(f"https://www.diningcode.com/profile.php?rid={rid}")
    time.sleep(2.5)
    html = driver.page_source
    out: dict = {}

    # 메뉴와 가격. 화면 구조가 자주 바뀌어서 눈에 보이는 글자에서 뽑습니다.
    try:
        from selenium.webdriver.common.by import By
        rows = driver.find_elements(By.CSS_SELECTOR, ".menu-info li, .list-menu li, .menu_list li")
        menus = []
        for r in rows[:12]:
            text = (r.text or "").strip()
            if not text:
                continue
            m = re.match(r"(.+?)\s+([\d,]{4,})\s*원?$", text.replace("\n", " "))
            if not m:
                continue
            price = to_price(m.group(2))
            if price:
                menus.append({"name": m.group(1).strip(), "price": price})
        if menus:
            out["menus"] = menus[:5]
    except Exception:
        pass

    # 점수. 검색어별로 흔들리는 값이라 카카오맵이 없을 때만 쓰라고 표시해 둡니다.
    m = re.search(r'"score"\s*:\s*"?([0-9.]+)"?', html)
    score = to_float(m.group(1)) if m else None
    if score is not None and 0 < score <= 5:
        out["rating"] = round(score, 1)
        out["src"] = "다이닝코드"

    if not out and debug:
        dump(driver, f"dining-place-{rid}")
    return out


SITES = {
    "kakao":  ("카카오맵",   kakao_find_id,  kakao_place),
    "dining": ("다이닝코드", dining_find_id, dining_place),
}


# -------------------------------------------------------------------- 실행

def area_hint(place: dict) -> str:
    """검색할 때 이름 뒤에 붙일 동네 이름.

    예전에는 '마곡' 이 박혀 있었습니다. 역이 구로·서초까지 늘어난 뒤로는
    '라까사 마곡' 처럼 엉뚱한 동네로 검색하게 되므로, 가게가 속한 지역에서 뽑습니다.
    """
    region = fp.region_of(place.get("station") or "")
    if region:
        terms = fp.REGIONS[region].get("area") or []
        if terms:
            return terms[0]
    return ""


def needs(place: dict, force: bool) -> bool:
    if force:
        return True
    has_coord = isinstance(place.get("lat"), (int, float))
    has_rating = isinstance(place.get("rating"), (int, float))
    return not (has_coord and has_rating and place.get("menus"))


def apply_to(place: dict, got: dict, force: bool) -> list[str]:
    """받아온 값을 넣습니다. 이미 있는 값은 덮지 않습니다(--force 제외)."""
    changed = []
    for key in ("lat", "lng", "addr", "tel", "reviews"):
        if key in got and (force or not place.get(key)):
            place[key] = got[key]
            changed.append(key)

    if "rating" in got:
        # 카카오맵 점수가 다이닝코드 점수를 이깁니다 (가게마다 값이 고정이라).
        better = force or not isinstance(place.get("rating"), (int, float)) \
                 or (got.get("src") == "kakao" and place.get("src") != "kakao")
        if better:
            place["rating"] = got["rating"]
            place["src"] = got.get("src", "")
            changed.append("rating")

    if got.get("menus") and (force or not place.get("menus")):
        place["menus"] = got["menus"]
        changed.append("menus")

    # 좌표가 들어왔으면 역과 도보 시간을 다시 계산합니다.
    if isinstance(place.get("lat"), (int, float)) and isinstance(place.get("lng"), (int, float)):
        station = fp.nearest_station(place["lat"], place["lng"])
        if station:
            place["station"] = station
            mins = fp.walk_minutes(place["lat"], place["lng"], station)
            if mins is not None:
                place["walk"] = mins
                changed.append("walk")
    return changed


def main() -> None:
    ap = argparse.ArgumentParser(description="카카오맵·다이닝코드에서 가게 정보 수집")
    ap.add_argument("--site", nargs="*", choices=sorted(SITES), default=sorted(SITES),
                    help="돌릴 사이트 (기본: 전부)")
    ap.add_argument("--only", nargs="*", metavar="이름", help="이 이름이 들어간 가게만")
    ap.add_argument("--limit", type=int, help="앞에서 N곳만")
    ap.add_argument("--force", action="store_true", help="이미 값이 있어도 다시 받기")
    ap.add_argument("--dry-run", action="store_true", help="파일은 그대로, 결과만 출력")
    ap.add_argument("--debug", action="store_true", help="못 읽으면 화면을 파일로 남김")
    args = ap.parse_args()

    cfg = fp.load_config()
    places = fp.read_existing()

    todo = [p for p in places if needs(p, args.force)]
    if args.only:
        todo = [p for p in todo if any(k in p["name"] for k in args.only)]
    if args.limit:
        todo = todo[:args.limit]

    if not todo:
        print("받아올 게 없습니다. 다시 받으려면 --force 를 붙이세요.")
        return

    print(f"대상 {len(todo)}곳 / 전체 {len(places)}곳")
    print(f"사이트: {', '.join(SITES[s][0] for s in args.site)}\n")

    import crawl_naver_place as cnp
    driver = cnp.make_driver(cfg)
    ok = fail = 0
    try:
        for i, place in enumerate(todo, 1):
            name = place["name"]
            print(f"[{i}/{len(todo)}] {name}", end=" … ", flush=True)
            bits = []
            try:
                for key in args.site:
                    label, find, fetch = SITES[key]
                    pid = find(driver, name, area_hint(place), args.debug)
                    if not pid:
                        bits.append(f"{label} 못 찾음")
                        continue
                    got = fetch(driver, pid, args.debug)
                    if not got:
                        bits.append(f"{label} 비어 있음")
                        continue
                    changed = apply_to(place, got, args.force)
                    bits.append(f"{label}({'·'.join(changed) if changed else '변화 없음'})")
                    time.sleep(1.5)
                ok += 1
            except Exception as exc:
                fail += 1
                bits.append(f"오류: {exc}")
            print(", ".join(bits))
            time.sleep(2.5)
    finally:
        driver.quit()

    print(f"\n성공 {ok}곳, 실패 {fail}곳")

    if args.dry_run:
        print("\n--dry-run 이라 파일은 그대로 둡니다.")
        return

    fp.write_page(places)
    print()
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "status.py")], cwd=ROOT)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n중단했습니다.")
