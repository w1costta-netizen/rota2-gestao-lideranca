@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════╗
echo ║        DEPLOY - ROTA 2.0            ║
echo ╚══════════════════════════════════════╝
echo.

cd /d "%~dp0frontend"

echo [1/2] Fazendo build...
call npm run build
if errorlevel 1 (
  echo ERRO no build! Verifique os erros acima.
  pause
  exit /b 1
)

echo.
echo [2/2] Enviando para o Netlify...
call netlify deploy --prod --dir=dist
if errorlevel 1 (
  echo.
  echo Se aparecer "Not logged in", rode primeiro:
  echo   netlify login
  echo.
  pause
  exit /b 1
)

echo.
echo ✅ Deploy concluído!
pause
