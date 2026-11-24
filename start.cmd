@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Python virtual environment not found. Follow README.md first.
  exit /b 1
)
".venv\Scripts\python.exe" scripts\run.py %*
