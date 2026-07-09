@echo off
title Rota 2.0 - Gestao de Lideranca
color 0A

echo.
echo  ================================================
echo    ROTA 2.0 - Gestao de Lideranca
echo  ================================================
echo.
echo  Iniciando os servidores, aguarde...
echo.

:: Inicia o Backend
echo  [1/2] Iniciando Backend...
start "Rota 2.0 - Backend" cmd /k "cd /d "%~dp0backend" && node server.js"

:: Aguarda 3 segundos para o backend subir
timeout /t 3 /nobreak >nul

:: Inicia o Frontend
echo  [2/2] Iniciando Frontend...
start "Rota 2.0 - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

:: Aguarda o frontend subir
echo.
echo  Aguardando o app ficar pronto...
timeout /t 8 /nobreak >nul

:: Abre o navegador
echo  Abrindo o navegador...
start "" "http://localhost:5173"

echo.
echo  ================================================
echo    App rodando em: http://localhost:5173
echo  ================================================
echo.
echo  Nao feche esta janela enquanto estiver usando o app.
echo  Para encerrar, feche as janelas do Backend e Frontend.
echo.
pause
