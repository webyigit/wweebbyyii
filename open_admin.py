"""로그인된 자동화 프로필로 네이버 블로그 관리자 페이지를 바로 여는 편의 스크립트.

사용법: .venv\\Scripts\\python.exe open_admin.py
"""

from pathlib import Path
import time

from auto_post import build_driver, load_config

config = load_config()
profile_dir = (Path(".").resolve() / config["chrome_profile_dir"]).resolve()
driver = build_driver(profile_dir, config)
driver.get(f"https://admin.blog.naver.com/{config['blog_id']}/config/topmenu")
time.sleep(3600)  # 창을 열어둔 채로 대기 (직접 Ctrl+C로 종료하거나 창을 닫으면 됨)
