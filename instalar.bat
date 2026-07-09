@echo off
echo === GestaoLideranca - Instalando dependencias ===
echo.

echo [1/2] Instalando backend...
cd backend
call npm install
cd ..

echo.
echo [2/2] Instalando frontend...
cd frontend
call npm install
cd ..

echo.
echo === Instalacao concluida! ===
echo Para iniciar, execute: iniciar.bat
pause
