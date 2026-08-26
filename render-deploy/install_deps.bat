@echo off
REM ============================================================
REM  Install the local LLM server dependency into a project venv
REM ============================================================
cd /d "%~dp0"

echo Creating Python virtual environment (.venv)...
python -m venv .venv
if errorlevel 1 (
  echo [ERROR] Could not create venv. Is Python installed and on PATH?
  pause
  exit /b 1
)

echo Installing llama-cpp-python (this can take a few minutes)...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt

if errorlevel 1 (
  echo.
  echo [WARN] Standard install failed. Trying prebuilt CPU wheel index...
  ".venv\Scripts\python.exe" -m pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu
)

echo.
echo Done. Start the model server with:  start_llm.bat
pause
