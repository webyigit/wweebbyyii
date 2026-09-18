"""마곡 맛집 페이지를 한 번에 갱신합니다.

윈도우에서는 update.bat 을 더블클릭하면 이 파일이 실행됩니다.
직접 돌리려면:

    python update.py                # 전부 (받아오기 -> 크롤링 -> 깃 푸시)
    python update.py --no-crawl     # 네이버 API 만, 크롬 안 띄움
    python update.py --no-push      # 깃에 올리지 않고 파일만 갱신
    python update.py --only-crawl   # 크롤링만 다시
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PY = sys.executable or "python"
BRANCH = "claude/magok-restaurant-page-9j1zxb"


def hr(title: str) -> None:
    print("\n" + "=" * 58)
    print(f"  {title}")
    print("=" * 58, flush=True)


def run(cmd: list[str], *, allow_fail: bool = False) -> int:
    """한 단계 실행. 실패하면 멈추고 무엇이 잘못됐는지 알려준다."""
    print(f"$ {' '.join(cmd)}", flush=True)
    try:
        code = subprocess.call(cmd, cwd=ROOT)
    except FileNotFoundError:
        print(f"\n[중단] '{cmd[0]}' 을(를) 찾을 수 없습니다.")
        if cmd[0] == "git":
            print("  git 이 설치돼 있지 않거나 PATH 에 없습니다.")
            print("  https://git-scm.com/download/win 에서 설치한 뒤 창을 새로 여세요.")
        raise SystemExit(1)

    if code != 0 and not allow_fail:
        print(f"\n[중단] 위 명령이 실패했습니다 (종료 코드 {code}).")
        print("  위에 찍힌 메시지를 그대로 복사해서 개발 세션에 물어보세요.")
        raise SystemExit(code)
    return code


def ensure_deps() -> bool:
    """selenium 이 없으면 알아서 설치한다.

    크롤링은 selenium 이 있어야 돌아가는데, 없으면 74곳을 다 훑고 나서야
    멈추는 게 아니라 시작도 못 한다. 그래서 미리 깔아 둔다.
    """
    try:
        import selenium  # noqa: F401
        return True
    except ImportError:
        pass

    print("selenium 이 없어서 먼저 설치합니다. 1~2분 걸릴 수 있습니다.")
    code = subprocess.call(
        [PY, "-m", "pip", "install", "-r", "requirements.txt"], cwd=ROOT)
    if code != 0:
        print("\n[중단] 설치에 실패했습니다. 아래를 직접 실행해 보세요:")
        print("    pip install -r requirements.txt")
        return False

    # 방금 깐 패키지는 이 프로세스에 안 잡힐 수 있어서 따로 확인한다.
    check = subprocess.call([PY, "-c", "import selenium"], cwd=ROOT)
    if check != 0:
        print("\n[중단] 설치는 됐지만 selenium 을 불러오지 못했습니다.")
        print("    창을 닫고 다시 update.bat 을 실행해 보세요.")
        return False
    print("설치 완료.")
    return True


def git_ready() -> bool:
    if shutil.which("git") is None:
        print("! git 을 찾을 수 없어 깃 단계는 건너뜁니다.")
        return False
    if not (ROOT / ".git").exists():
        print("! 깃 저장소가 아니라 깃 단계는 건너뜁니다.")
        return False
    return True


def git_out(*args: str) -> str:
    out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    return out.stdout.strip()


def ensure_branch() -> bool:
    """작업용 브랜치에 있는지 확인하고, 아니면 옮겨 준다.

    엉뚱한 브랜치(보통 main)에 있으면 git pull 을 해도 이 페이지 작업이 안 딸려온다.
    고친 파일이 남아 있으면 덮어쓰지 않고 멈춘다.
    """
    current = git_out("rev-parse", "--abbrev-ref", "HEAD")
    if current == BRANCH:
        print(f"브랜치: {current}")
        return True

    print(f"! 지금 '{current}' 브랜치에 있습니다. 이 페이지 작업은 '{BRANCH}' 에 있습니다.")
    if has_changes():
        print("  아직 저장하지 않은 변경이 있어서 자동으로 옮기지 않습니다.")
        print("  먼저 정리한 뒤 아래를 직접 실행하세요:")
        print(f"    git checkout {BRANCH}")
        return False

    print("  브랜치를 옮깁니다.")
    run(["git", "fetch", "origin", BRANCH], allow_fail=True)
    code = subprocess.call(["git", "checkout", BRANCH], cwd=ROOT)
    if code != 0:
        code = subprocess.call(
            ["git", "checkout", "-b", BRANCH, f"origin/{BRANCH}"], cwd=ROOT)
    if code != 0:
        print(f"\n[중단] '{BRANCH}' 브랜치로 옮기지 못했습니다.")
        return False
    print(f"브랜치: {BRANCH}")
    return True


def has_changes() -> bool:
    out = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                         capture_output=True, text=True)
    return bool(out.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser(description="마곡 맛집 페이지 한 번에 갱신")
    ap.add_argument("--no-crawl", action="store_true", help="크롤링 건너뛰기")
    ap.add_argument("--only-crawl", action="store_true", help="크롤링만 하기")
    ap.add_argument("--no-push", action="store_true", help="깃에 올리지 않기")
    ap.add_argument("--no-photos", action="store_true", help="사진은 받지 않기")
    args = ap.parse_args()

    print(f"작업 폴더: {ROOT}")
    print(f"파이썬   : {PY}")

    use_git = git_ready() and not args.no_push

    if use_git:
        hr("1. 최신 코드 받기")
        if not ensure_branch():
            raise SystemExit(1)
        run(["git", "pull"], allow_fail=True)

    if not args.only_crawl:
        hr("2. 네이버 지역검색으로 가게 목록·좌표 갱신")
        code = run([PY, "fetch_places.py"], allow_fail=True)
        if code != 0:
            print("\n! 이 단계를 건너뜁니다. 네이버 API 키가 아직 없으면 정상입니다.")
            print("  키를 넣는 방법은 README 의 '데이터 채우기' 항목을 보세요.")

    if not args.no_crawl:
        hr("3. 네이버 플레이스에서 별점·메뉴·사진·좌표 받기")
        if not ensure_deps():
            raise SystemExit(1)
        print("크롬 창이 뜹니다. 끝날 때까지 닫지 마세요. 가게가 많으면 시간이 꽤 걸립니다.")
        cmd = [PY, "crawl_naver_place.py"]
        if args.no_photos:
            cmd.append("--no-photos")
        run(cmd, allow_fail=True)

    if use_git:
        hr("4. 깃에 올리기")
        if not has_changes():
            print("바뀐 내용이 없어 올릴 것이 없습니다.")
        else:
            run(["git", "add", "-A"])
            run(["git", "commit", "-m", "Update place data from Naver"], allow_fail=True)
            branch = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                                    cwd=ROOT, capture_output=True, text=True).stdout.strip()
            run(["git", "push", "-u", "origin", branch or "HEAD"], allow_fail=True)

    hr("끝")
    page = ROOT / "docs" / "magok-matjip" / "index.html"
    print(f"페이지를 브라우저로 열어 확인하세요:\n  {page}")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except KeyboardInterrupt:
        print("\n중단했습니다.")
