@echo off
setlocal

rem ===================================================================
rem  네이버 블로그 자동발행 - 작업 스케줄러가 호출하는 실행 래퍼
rem
rem  Claude 루틴이 GitHub 에 커밋해둔 초안을 git pull 로 받아온 뒤,
rem  auto_post.py 를 무인 모드로 실행한다.
rem  수동으로 한 번 시험해보려면 그냥 이 파일을 실행하면 된다.
rem ===================================================================

cd /d "%~dp0"

set "PY=%~dp0.venv\Scripts\python.exe"
set "LOGDIR=%~dp0logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOGFILE=%LOGDIR%\auto_post.log"

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH:mm:ss"') do set "TS=%%t"

echo.>> "%LOGFILE%"
echo ==== %TS% 실행 시작 ====>> "%LOGFILE%"

if not exist "%PY%" (
    echo [오류] 가상환경 파이썬이 없습니다: %PY%>> "%LOGFILE%"
    echo [오류] 먼저 .venv 를 만들고 pip install -r requirements.txt 를 실행하세요.>> "%LOGFILE%"
    exit /b 1
)

rem 초안은 Claude 루틴이 원격에 커밋하므로 먼저 받아온다.
rem 실패해도(오프라인 등) 로컬에 있는 초안으로 계속 진행한다.
git pull --ff-only>> "%LOGFILE%" 2>&1
if errorlevel 1 echo [경고] git pull 실패 - 로컬 초안으로 계속 진행합니다.>> "%LOGFILE%"

"%PY%" auto_post.py --unattended>> "%LOGFILE%" 2>&1
set "RC=%ERRORLEVEL%"

rem 발행에 성공하면 초안의 status 가 published 로 바뀐다.
rem 그 결과를 원격에 올려두면 Claude 루틴이 중복 초안을 만들지 않는다.
rem (git 자격증명이 저장돼 있지 않으면 조용히 실패하므로 실행 결과에는 영향 없음)
if "%RC%"=="0" (
    git add posts>> "%LOGFILE%" 2>&1
    git diff --cached --quiet
    if errorlevel 1 (
        git commit -m "chore: mark published posts from scheduled run">> "%LOGFILE%" 2>&1
        git push>> "%LOGFILE%" 2>&1
        if errorlevel 1 echo [경고] git push 실패 - 발행 자체는 정상 완료됐습니다.>> "%LOGFILE%"
    )
)

echo ==== 종료 코드 %RC% ====>> "%LOGFILE%"
exit /b %RC%
