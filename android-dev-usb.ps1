
# powershell -ExecutionPolicy Bypass -File .\android-dev-usb.ps1
# Shell cancelled . npm run dev
# Shell cancelled . powershell -ExecutionPolicy Bypass -File .\android-dev-usb.ps1


Set-Location $PSScriptRoot
$env:ANDROID_HOME = 'C:\Users\asus\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\27.1.12297006"
$env:PATH = "$env:ANDROID_HOME\platform-tools;$env:PATH"

adb devices
$attached = adb devices | Select-String '\tdevice$'
if (-not $attached) { Write-Output 'No authorized USB device found. Enable USB debugging and accept RSA.'; exit 1 }

adb reverse tcp:5173 tcp:5173
npx tauri android dev --host 127.0.0.1
