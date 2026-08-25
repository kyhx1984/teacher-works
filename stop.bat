@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem 教师兼班主任工作台 - Windows 一键停止脚本
rem
rem 用法:
rem   双击 stop.bat          停止后端服务
rem   stop.bat nopause       内部调用(结束时不暂停窗口)
rem
rem 说明:
rem   - 读取 run\backend.pid 定位进程, 先优雅结束(含子进程树),
rem     10 秒内未退出则强制结束
rem ============================================================

set "NOPAUSE=%~1"
set "BACKEND_PID=%~dp0run\backend.pid"

cd /d "%~dp0"

echo == 停止服务 ==

if not exist "%BACKEND_PID%" (
    echo   [跳过] 后端服务未在运行
    goto done
)

rem 读取 PID
set "PID="
for /f "usebackq delims=" %%p in ("%BACKEND_PID%") do set "PID=%%p"
if "%PID%"=="" (
    echo   [跳过] 后端服务未在运行
    del "%BACKEND_PID%" 2>nul
    goto done
)

rem 检查进程是否仍存活
tasklist /fi "PID eq %PID%" 2>nul | find /i "node.exe" >nul
if errorlevel 1 (
    echo   [已停止] 后端进程不存在 (PID %PID%^)
    del "%BACKEND_PID%" 2>nul
    goto done
)

rem 先尝试优雅结束(连同子进程树)
taskkill /PID %PID% /T >nul 2>&1

rem 最多等待 10 秒
set /a WAIT=0
:wait_loop
tasklist /fi "PID eq %PID%" 2>nul | find /i "node.exe" >nul
if errorlevel 1 goto stopped
set /a WAIT+=1
if %WAIT% GEQ 10 goto force_kill
timeout /t 1 /nobreak >nul
goto wait_loop

:force_kill
taskkill /PID %PID% /T /F >nul 2>&1
echo   [强制] 后端服务已强制停止 (PID %PID%^)
goto cleanup

:stopped
echo   [已停止] 后端服务 (PID %PID%^)

:cleanup
del "%BACKEND_PID%" 2>nul

:done
echo == 服务已停止 ==
if /i not "%NOPAUSE%"=="nopause" pause
exit /b 0
