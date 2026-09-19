"""공공데이터(서울 열린데이터광장)에서 음식점 좌표·주소를 받아옵니다.

    python fetch_public.py                 # 목록에 있는 가게의 좌표·주소 채우기
    python fetch_public.py --add           # 역 근처 음식점을 목록에 새로 추가까지
    python fetch_public.py --dry-run       # 파일은 그대로, 결과만 출력
    python fetch_public.py --closed        # 폐업한 가게를 찾아서 표시

왜 이걸 쓰나
------------
**도보 시간은 좌표에서 계산합니다.** 그런데 좌표를 얻으려면 네이버·카카오를 긁어야
했고, 그건 느리고 사이트 구조가 바뀌면 깨집니다. 음식점 인허가 정보는 **공개된
행정 데이터**라 크롤링 없이 받을 수 있고, 다음이 한 번에 들어옵니다.

- 좌표 (→ 가장 가까운 역, 도보 분)
- 도로명·지번 주소
- 전화번호
- 업태(한식/일식/중국식/호프 등) → 분류 보정
- **영업상태** — 폐업한 가게를 목록에서 걷어낼 수 있습니다. 문 닫은 집을
  계속 올려 두는 건 보는 사람에게도 그 가게에도 좋지 않습니다.

별점과 메뉴는 인허가 데이터에 없습니다. 그건 crawl_naver_place.py / crawl_sites.py
쪽입니다.

준비
----
1. https://data.seoul.go.kr 에서 인증키를 무료로 발급받습니다.
2. config.json 에 넣거나 환경변수로 줍니다.

       {"seoul_api_key": "..."}          또는   set SEOUL_API_KEY=...

3. 좌표 변환에 pyproj 가 필요합니다. 없으면 이 스크립트가 알려 줍니다.

       pip install pyproj

좌표계 주의
-----------
이 데이터의 X/Y 는 **위경도가 아닙니다.** 중부원점TM(EPSG:5174)이라 그대로 쓰면
가게가 엉뚱한 곳에 찍힙니다. pyproj 로 WGS84 로 바꿔서 넣습니다.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request

import fetch_places as fp

# 서울 열린데이터광장 OpenAPI.
#   http://openapi.seoul.go.kr:8088/{KEY}/json/{SERVICE}/{START}/{END}/
# 일반음식점은 LOCALDATA_072404, 휴게음식점(카페·제과)은 LOCALDATA_072405 입니다.
# 서비스명이 바뀌면 --service 로 덮어쓸 수 있게 해 뒀습니다.
BASE = "http://openapi.seoul.go.kr:8088/{key}/json/{service}/{start}/{end}/"
SERVICES = {
    "food": "LOCALDATA_072404",   # 일반음식점
    "rest": "LOCALDATA_072405",   # 휴게음식점 (카페·제과 등)
}
PAGE = 1000          # 한 번에 받을 건수 (이 API 최대)

# 인허가 데이터의 업태 -> 페이지 분류
UPTAE_RULES = [
    ("호프", "bar"), ("소주", "bar"), ("정종", "bar"), ("탁주", "bar"),
    ("주점", "bar"), ("바", "bar"), ("카페", "cafe"), ("제과", "cafe"),
    ("커피", "cafe"), ("분식", "snack"), ("김밥", "snack"),
    ("횟집", "hoe"), ("생선", "hoe"), ("일식", "japanese"),
    ("중국", "chinese"), ("경양식", "western"), ("패스트푸드", "western"),
    ("한식", "korean"), ("음식점", "korean"),
]

OPEN_STATE = ("영업", "정상")   # 영업상태명에 이게 들어가면 영업 중으로 본다


def api_key(cfg: dict) -> str:
    import os
    key = (cfg.get("seoul_api_key") or os.environ.get("SEOUL_API_KEY") or "").strip()
    if not key:
        sys.exit(
            "서울 열린데이터광장 인증키가 없습니다.\n"
            "  1) https://data.seoul.go.kr 에서 무료로 발급받으세요.\n"
            "  2) config.json 에 {\"seoul_api_key\": \"...\"} 로 넣거나\n"
            "     환경변수 SEOUL_API_KEY 로 주세요."
        )
    return key


def to_wgs84():
    """중부원점TM(EPSG:5174) -> WGS84 변환기.

    이 데이터의 X/Y 는 위경도가 아닙니다. 그대로 넣으면 가게가 엉뚱한 곳에
    찍히고 도보 시간이 말도 안 되게 나옵니다.
    """
    try:
        from pyproj import Transformer
    except ImportError:
        sys.exit(
            "좌표 변환에 pyproj 가 필요합니다:  pip install pyproj\n"
            "(이 데이터의 X/Y 는 위경도가 아니라 중부원점TM 이라 변환이 필요합니다.)"
        )
    return Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)


def fetch_page(key: str, service: str, start: int, end: int) -> dict:
    url = BASE.format(key=urllib.parse.quote(key), service=service, start=start, end=end)
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def rows_of(payload: dict, service: str) -> tuple[list[dict], int]:
    body = payload.get(service)
    if not body:
        # 인증 실패·서비스명 오류는 여기로 온다. 메시지를 그대로 보여 준다.
        msg = json.dumps(payload, ensure_ascii=False)[:400]
        raise RuntimeError(
            f"응답에 '{service}' 가 없습니다. 인증키나 서비스명을 확인하세요.\n"
            f"  서비스명은 https://data.seoul.go.kr 의 해당 데이터 페이지에서 볼 수 있고,\n"
            f"  --service 로 바꿔 줄 수 있습니다.\n  받은 응답: {msg}"
        )
    result = body.get("RESULT") or {}
    code = result.get("CODE", "")
    if code and not code.startswith("INFO-000"):
        raise RuntimeError(f"API 오류 {code}: {result.get('MESSAGE', '')}")
    return body.get("row") or [], int(body.get("list_total_count") or 0)


def norm(name: str) -> str:
    """가게 이름 맞춰 보기용. 띄어쓰기·괄호·지점 표기를 걷어낸다."""
    s = re.sub(r"\(.*?\)", "", name or "")
    s = re.sub(r"(본점|직영점|[가-힣]{1,6}점)$", "", s.strip())
    return re.sub(r"[\s·・\-_,.]", "", s).lower()


def guess_cat(uptae: str, fallback: str = "korean") -> str:
    for word, cat in UPTAE_RULES:
        if word in (uptae or ""):
            return cat
    return fallback


def is_open(row: dict) -> bool:
    state = (row.get("TRDSTATENM") or row.get("DTLSTATENM") or "").strip()
    return any(w in state for w in OPEN_STATE)


def near_any_station(lat: float, lng: float, km: float) -> str:
    """역에서 km 안이면 그 역 id, 아니면 빈 문자열."""
    best, best_d = "", float("inf")
    for sid, (slat, slng) in fp.STATIONS.items():
        dx = (lat - slat) * 111.0
        dy = (lng - slng) * 88.0
        d = (dx * dx + dy * dy) ** 0.5
        if d < best_d:
            best, best_d = sid, d
    return best if best_d <= km else ""


def collect(key: str, service: str, tr, km: float) -> dict[str, dict]:
    """역 근처의 영업 중인 가게만 모은다. 이름(정규화) -> 정보."""
    out: dict[str, dict] = {}
    start, total, seen = 1, None, 0
    while True:
        end = start + PAGE - 1
        payload = fetch_page(key, service, start, end)
        rows, total = rows_of(payload, service)
        if not rows:
            break
        for row in rows:
            seen += 1
            if not is_open(row):
                continue
            try:
                x, y = float(row.get("X") or 0), float(row.get("Y") or 0)
            except (TypeError, ValueError):
                continue
            if not x or not y:
                continue
            lng, lat = tr.transform(x, y)
            station = near_any_station(lat, lng, km)
            if not station:
                continue
            name = (row.get("BPLCNM") or "").strip()
            if not name:
                continue
            out[norm(name)] = {
                "name": name,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
                "station": station,
                "addr": (row.get("RDNWHLADDR") or row.get("SITEWHLADDR") or "").strip(),
                "tel": (row.get("SITETEL") or "").strip(),
                "uptae": (row.get("UPTAENM") or "").strip(),
            }
        print(f"  {service}: {seen}건 훑음, 역 근처 {len(out)}곳", flush=True)
        if total is not None and end >= total:
            break
        start = end + 1
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="공공데이터에서 음식점 좌표·주소 받기")
    ap.add_argument("--add", action="store_true", help="역 근처 음식점을 목록에 새로 추가")
    ap.add_argument("--closed", action="store_true", help="폐업으로 보이는 가게를 알려 줌")
    ap.add_argument("--km", type=float, default=0.8, help="역에서 이 거리(km) 안만 (기본 0.8)")
    ap.add_argument("--service", nargs="*", help="서비스명 직접 지정")
    ap.add_argument("--force", action="store_true", help="이미 좌표가 있어도 덮어쓰기")
    ap.add_argument("--dry-run", action="store_true", help="파일은 그대로, 결과만 출력")
    args = ap.parse_args()

    cfg = fp.load_config()
    key = api_key(cfg)
    tr = to_wgs84()

    services = args.service or list(SERVICES.values())
    found: dict[str, dict] = {}
    for service in services:
        print(f"{service} 받는 중 …", flush=True)
        try:
            found.update(collect(key, service, tr, args.km))
        except Exception as exc:
            print(f"  ! {exc}")

    if not found:
        print("\n받아온 게 없습니다. 인증키와 서비스명을 확인하세요.")
        return
    print(f"\n역 근처 영업 중인 음식점 {len(found)}곳을 받았습니다.\n")

    places = fp.read_existing()
    filled = 0
    for place in places:
        if not args.force and isinstance(place.get("lat"), (int, float)):
            continue
        hit = found.get(norm(place["name"]))
        if not hit:
            continue
        place["lat"], place["lng"] = hit["lat"], hit["lng"]
        if not place.get("addr"):
            place["addr"] = hit["addr"]
        if not place.get("tel"):
            place["tel"] = hit["tel"]
        station = fp.nearest_station(hit["lat"], hit["lng"])
        if station:
            place["station"] = station
            mins = fp.walk_minutes(hit["lat"], hit["lng"], station)
            if mins is not None:
                place["walk"] = mins
        filled += 1
        print(f"  좌표 채움: {place['name']} ({place['station']} 도보 {place.get('walk','?')}분)")

    if args.closed:
        # 인허가 데이터에 영업 중으로 안 잡히는 가게. 폐업했거나 이름이 다를 수 있다.
        missing = [p["name"] for p in places if norm(p["name"]) not in found]
        print(f"\n인허가 데이터에서 영업 중으로 안 잡힌 가게 {len(missing)}곳:")
        for name in missing[:20]:
            print(f"  · {name}")
        if len(missing) > 20:
            print(f"  … 외 {len(missing) - 20}곳")
        print("  (폐업했거나, 상호가 인허가 등록명과 다를 수 있습니다. 직접 확인하세요.)")

    added = 0
    if args.add:
        have = {norm(p["name"]) for p in places}
        for k, hit in found.items():
            if k in have:
                continue
            mins = fp.walk_minutes(hit["lat"], hit["lng"], hit["station"])
            places.append({
                "name": hit["name"], "cat": guess_cat(hit["uptae"]),
                "menu": hit["uptae"] or "", "resv": False, "ct": "",
                "note": "", "where": "", "addr": hit["addr"], "tel": hit["tel"],
                "photo": "", "rating": None, "reviews": None, "src": "",
                "menus": [], "station": hit["station"], "walk": mins,
                "lat": hit["lat"], "lng": hit["lng"],
            })
            added += 1
        print(f"\n새로 추가 {added}곳")

    print(f"\n좌표를 채운 곳 {filled}곳, 추가 {added}곳, 전체 {len(places)}곳")

    if args.dry_run:
        print("\n--dry-run 이라 파일은 그대로 둡니다.")
        return

    fp.write_page(places)
    print()
    import subprocess
    subprocess.run([sys.executable, str(fp.ROOT / "status.py")], cwd=fp.ROOT)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n중단했습니다.")
