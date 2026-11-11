# Script dong goi APK moi nhat tu du lieu PC (IELTS Vocab Companion)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ElectronExe = Join-Path $Root "node_modules\electron\dist\electron.exe"
$env:ELECTRON_RUN_AS_NODE = "1"

Write-Host "1/3 Dang ket xuat tu vung moi nhat + anh/audio offline tu PC..."
& $ElectronExe --no-warnings "scripts\export-mobile-bundle.js"

Write-Host "2/3 Dang build giao dien ung dung + bundle offline (Vite)..."
& $ElectronExe --no-warnings "node_modules\vite\bin\vite.js" build

$AndroidDir = Join-Path $Root "android"
$Gradlew = Join-Path $AndroidDir "gradlew.bat"

if (Test-Path $Gradlew) {
  Write-Host "3/3 Dang dong goi file Android APK (Gradle assembleDebug)..."
  Push-Location $AndroidDir
  & .\gradlew.bat assembleDebug
  Pop-Location

  $BuiltApk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
  $DestApk = Join-Path $Root "release\IELTS-Vocab-latest.apk"
  if (Test-Path $BuiltApk) {
    Copy-Item $BuiltApk $DestApk -Force
    Write-Host "HOAN TAT! File APK moi nhat: $DestApk"
    exit 0
  }
} else {
  Write-Host "3/3 Da cap nhat xong goi du lieu Mobile tai dist/ va release/ielts-vocab-latest-backup.json."
  Write-Host "Luu y: May chua khoi tao thu muc android/ (Capacitor + Android SDK). Xem docs/PLAN_MOBILE_APK.md de khoi tao 1 lan duy nhat hoac build APK tren GitHub Actions."
  exit 0
}

