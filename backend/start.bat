@echo off
REM Starts the userbot service on Windows using the local virtual environment.
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo No virtual environment found. Run these once:
  echo   python -m venv .venv
  echo   .venv\Scripts\pip install "setuptools^<78" wheel
  echo   .venv\Scripts\pip install -r requirements.txt
  exit /b 1
)

.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
