@echo off
chcp 65001 >nul
title BiyometrikPlus — Profesyonel Biyometrik & Vesikalik Studyosu
cd /d "%~dp0"
set ELECTRON_START_URL=file
if not exist "dist\index.html" (
    echo BiyometrikPlus derleniyor...
    call npm run build
)
start "" ".\node_modules\electron\dist\electron.exe" .
