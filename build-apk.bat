@echo off
chcp 65001 >nul
echo ========================================================
echo   DONG GOI IELTS VOCAB (.EXE PORTABLE + ANDROID APK)
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-apk.ps1"
echo.
pause

