@echo off
setlocal
cd /d "%~dp0"

set PY=python
if exist ".venv\Scripts\python.exe" set PY=.venv\Scripts\python.exe

"%PY%" update.py %*
if errorlevel 1 (
  echo.
  echo Something failed. Scroll up for the message.
)

echo.
pause
