#!/bin/sh
# 앱을 빌드해서 GitHub Pages 폴더(docs/church-finance)로 복사합니다.
# 그다음 커밋하고 main 에 반영하면 https://webyigit.github.io/wweebbyyii/church-finance/ 가 바뀝니다.
set -e
cd "$(dirname "$0")/app"
npm run build
OUT=../../docs/church-finance
rm -rf "$OUT"
mkdir -p "$OUT"
cp -r dist/. "$OUT"/
echo "복사 끝: docs/church-finance"
