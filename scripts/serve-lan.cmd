@echo off
REM Builds the production bundle against the hosted Supabase backend and serves it on the local
REM network, so other laptops on the same Wi-Fi can open it and play.
REM   npm run serve:lan:win            (build + serve on port 4173)
REM   set PORT=8080 ^&^& npm run serve:lan:win
REM   set SKIP_BUILD=1 ^&^& npm run serve:lan:win
setlocal
cd /d "%~dp0.."
if "%PORT%"=="" set PORT=4173
if not exist node_modules\vite ( echo Installing dependencies... & call npm install || exit /b 1 )

if not "%SKIP_BUILD%"=="1" (
  echo Building production bundle ^(Supabase backend^)...
  set VITE_BACKEND=supabase
  call npm run build || exit /b 1
)

echo.
echo Serving Crooked Cop
echo    This laptop:   http://localhost:%PORT%
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo    Other laptops: http://%%b:%PORT%
)
echo    ^(Same Wi-Fi needed. If Windows Firewall asks about Node.js, allow Private networks.^)
echo.
call npx vite preview --host 0.0.0.0 --port %PORT% --strictPort
