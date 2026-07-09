@echo off
echo === GestaoLideranca - Iniciando ===
echo.
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.

start "Backend - GestaoLideranca" cmd /k "cd /d "%~dp0backend" && node server.js"
timeout /t 2 /nobreak > nul
start "Frontend - GestaoLideranca" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 3 /nobreak > nul
start http://localhost:5173
