"""지금 페이지에 뭐가 채워져 있고 뭐가 비어 있는지 보여 줍니다.

    python status.py

인터넷을 안 씁니다. 크롤링을 돌리기 전후로 돌려 보면 뭐가 늘었는지 바로 보입니다.
'도보 시간 미확인' 이 왜 나오는지 확인할 때 제일 먼저 돌려 보세요.
"""

from __future__ import annotations

import fetch_places as fp


def bar(done: int, total: int, width: int = 24) -> str:
    if total <= 0:
        return ""
    filled = round(width * done / total)
    return "█" * filled + "·" * (width - filled)


def main() -> None:
    places = fp.read_existing()
    total = len(places)
    if not total:
        print("가게 데이터가 비어 있습니다. fetch_places.py 를 먼저 돌리세요.")
        return

    def count(pred) -> int:
        return sum(1 for p in places if pred(p))

    num = (int, float)
    rows = [
        ("좌표", count(lambda p: isinstance(p.get("lat"), num)
                                 and isinstance(p.get("lng"), num))),
        ("도보 시간", count(lambda p: isinstance(p.get("walk"), num))),
        ("별점", count(lambda p: isinstance(p.get("rating"), num))),
        ("인기 메뉴", count(lambda p: bool(p.get("menus")))),
        ("소개글", count(lambda p: bool(p.get("note")))),
    ]

    print(f"가게 {total}곳\n")
    width = max(len(k) for k, _ in rows)
    for key, done in rows:
        print(f"  {key:<{width}}  {bar(done, total)}  {done:>3}/{total}")

    walked = dict(rows)["도보 시간"]
    if walked == total:
        print("\n도보 시간이 모두 채워져 있습니다.")
        return

    # 도보 분은 좌표에서 계산합니다. 좌표가 없으면 페이지에 '도보 시간 미확인'
    # 이 나가고, 지어내지 않습니다.
    missing = [p["name"] for p in places if not isinstance(p.get("walk"), num)]
    print(f"\n도보 시간이 없는 곳 {len(missing)}곳 — 좌표가 없어서입니다.")
    for name in missing[:10]:
        print(f"  · {name}")
    if len(missing) > 10:
        print(f"  … 외 {len(missing) - 10}곳")

    print("\n채우려면 (크롬이 뜹니다, API 키 없어도 됩니다):")
    print("  python crawl_naver_place.py")
    print("\n또는 한 번에:  update.bat")


if __name__ == "__main__":
    main()
