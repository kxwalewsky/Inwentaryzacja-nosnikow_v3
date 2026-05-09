@echo off
setlocal

echo =============================================
echo Budowanie instalatora Windows - Repetytorium POS
echo =============================================

echo.
echo Krok 1/3: instalacja zaleznosci Node.js...
call npm install
if errorlevel 1 goto error

echo.
echo Krok 2/3: budowanie aplikacji Tauri...
call npm run tauri:build
if errorlevel 1 goto error

echo.
echo Gotowe.
echo Instalatorow szukaj w folderze:
echo src-tauri\target\release\bundle\
echo.
pause
exit /b 0

:error
echo.
echo Wystapil blad budowania.
echo Sprawdz, czy masz zainstalowane Node.js, Rust oraz Visual Studio Build Tools z opcja Desktop development with C++.
echo.
pause
exit /b 1
