@echo off
title Video Viet AI - Server
color 0A

echo ========================================================
echo        DANG KHOI DONG DICH VU VIDEO VIET AI...
echo ========================================================
echo.

cd /d "%~dp0apps\web"

rem Kiem tra va uu tien chay bang Bun neu co
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
    echo [OK] Phat hien Bun runtime. Dang khoi dong Web Server tren http://localhost:3000 ...
    echo.
    "%USERPROFILE%\.bun\bin\bun.exe" run dev
) else (
    echo [OK] Dang khoi dong bang Node / Next.js tren http://localhost:3000 ...
    echo.
    node ./node_modules/next/dist/bin/next dev
)

pause
