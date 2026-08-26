@echo off
REM ============================================================
REM  Start the shared local GGUF model server (port 8000)
REM  Uses the project .venv if present, else system Python.
REM ============================================================
cd /d "%~dp0"

if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" run_llm.py
) else (
  echo [INFO] No .venv found; using system Python.
  echo [INFO] If this fails, run install_deps.bat first.
  python run_llm.py
)
pause
