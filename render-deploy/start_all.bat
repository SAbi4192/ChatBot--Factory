@echo off
title Universal Chatbot Factory - Launcher
color 0E
echo ================================================================
echo    UNIVERSAL CHATBOT FACTORY
echo    Launching local LLM + backend + frontend...
echo ================================================================
echo.

REM --- 1) Local GGUF model server (optional; Groq covers it if absent) ---
if exist start_llm.bat (
  echo [1/3] Starting local LLM server...
  start "Factory - Local LLM (port 8000)" cmd /k start_llm.bat
) else (
  echo [1/3] start_llm.bat not found - skipping local model ^(cloud AI will be used^).
)

REM --- 2) Backend API (Express + SQLite, port 3001) ---
echo [2/3] Starting backend API...
start "Factory - Backend (port 3001)" cmd /k "npm run server"

REM --- 3) Frontend (Vite dev server) ---
echo [3/3] Starting frontend...
start "Factory - Frontend (Vite)" cmd /k "npm run dev"

echo.
echo ----------------------------------------------------------------
echo  Three windows are opening. Wait for the FRONTEND window to show
echo  a "Local:" URL (usually http://localhost:5173), then open it.
echo.
echo  To stop everything, close each of the three windows.
echo ----------------------------------------------------------------
echo.
pause
