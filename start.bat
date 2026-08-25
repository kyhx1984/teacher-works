@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem 教师兼班主任工作台 - Windows 一键启动脚本
rem
rem 用法:
rem   双击 start.bat            启动服务(生产模式, 前端由后端托管)
rem   start.bat status          查看运行状态
rem   start.bat restart         重启服务
rem   start.bat install         仅安装环境(等同 install.bat)
rem
rem 说明:
rem   - 首次运行自动检测环境, 缺失时自动调用 install.bat 安装
rem   - 后端服务运行于 3000 端口(可修改下方 PORT 变量)
rem   - 日志: logs\backend.log 与 logs\backend.err.log
rem   - 进程 PID 记录在 run\backend.pid, 使用 stop.bat 一键停止
rem ============================================================

rem 服务端口(被占用时修改这里)
set "PORT=3000"

set "RUN_DIR=%~dp0run"
set "LOG_DIR=%~dp0logs"
set "BACKEND_DIR=%~dp0backend"
set "BACKEND_PID=%RUN_DIR%\backend.pid"

if not exist "%RUN_DIR%" mkdir "%RUN_DIR%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=start"

if /i "%MODE%"=="install" goto do_install
if /i "%MODE%"=="status" goto show_status
if /i "%MODE%"=="restart" goto do_restart
if /i not "%MODE%"=="start" goto usage

:start_flow_entry
rem ============================================================
rem 启动流程
rem ============================================================

rem 显示版本信息
if exist "%~dp0VERSION.txt" (
    echo ======================================================
    type "%~dp0VERSION.txt"
    echo ======================================================
    echo.
)

rem 防重复启动: PID 文件存在且进程仍存活则直接退出
call :is_backend_running
if %errorlevel%==0 (
    for /f "usebackq delims=" %%p in ("%BACKEND_PID%") do echo   后端已在运行 (PID %%p^)
    echo   如需重启请运行: start.bat restart
    pause
    exit /b 0
)

rem 环境自检: node / 后端依赖 / 前端构建产物 任一缺失则自动安装
call :check_env
if errorlevel 1 (
    echo == 首次运行, 正在自动安装环境(可能需要几分钟)... ==
    call "%~dp0install.bat" nopause
    if errorlevel 1 (
        echo   [失败] 环境安装失败, 请先手动运行 install.bat 排查问题
        pause
        exit /b 1
    )
    rem install.bat 内部的 PATH 修改在其 setlocal 结束后失效, 此处重新补充
    if exist "C:\Program Files\nodejs\node.exe" set "PATH=%PATH%;C:\Program Files\nodejs"
    rem 重新校验
    call :check_env
    if errorlevel 1 (
        echo   [失败] 环境仍不完整, 请手动运行 install.bat 排查问题
        pause
        exit /b 1
    )
)

rem 确保上传目录存在
if not exist "%BACKEND_DIR%\uploads" mkdir "%BACKEND_DIR%\uploads"

echo == 正在启动后端服务...
rem 通过 PowerShell 后台启动 node 并捕获真实 PID(隐藏窗口, 日志重定向到文件)
powershell -NoProfile -Command "$p = Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory '%BACKEND_DIR%' -WindowStyle Hidden -RedirectStandardOutput '%LOG_DIR%\backend.log' -RedirectStandardError '%LOG_DIR%\backend.err.log' -PassThru; Write-Output $p.Id" > "%BACKEND_PID%"

rem 读取并校验 PID
set "PID="
for /f "usebackq delims=" %%p in ("%BACKEND_PID%") do set "PID=%%p"
if "%PID%"=="" (
    echo   [失败] 无法获取后端进程 PID
    pause
    exit /b 1
)

rem 健康检查: 轮询 /api/v1/health, 最多等待 30 秒
set /a TRIES=0
:wait_loop
curl -sf -o nul --max-time 2 "http://127.0.0.1:%PORT%/api/v1/health" >nul 2>&1
if not errorlevel 1 goto start_ok
set /a TRIES+=1
if %TRIES% GEQ 30 goto start_failed
timeout /t 1 /nobreak >nul
goto wait_loop

:start_ok
echo   后端服务启动成功 -^> http://localhost:%PORT%  (PID %PID%^)
echo.
echo   默认账号: admin / admin123
echo   正在打开浏览器...(服务在后台运行, 关闭本窗口不影响)
start "" "http://localhost:%PORT%"
echo.
echo   按任意键关闭本窗口(服务继续后台运行), 停止服务请双击 stop.bat
pause >nul
exit /b 0

:start_failed
echo   [失败] 后端健康检查未通过, 请查看日志: logs\backend.err.log
echo   ---- 错误日志尾部 ----
if exist "%LOG_DIR%\backend.err.log" powershell -NoProfile -Command "Get-Content -Tail 20 '%LOG_DIR%\backend.err.log'"
if exist "%LOG_DIR%\backend.log" powershell -NoProfile -Command "Get-Content -Tail 20 '%LOG_DIR%\backend.log'"
echo   --------------------
rem 结束残留的 node 进程并清理 PID 文件
taskkill /PID %PID% /T /F >nul 2>&1
del "%BACKEND_PID%" 2>nul
pause
exit /b 1

rem ============================================================
rem 子命令: install / status / restart
rem ============================================================

:do_install
call "%~dp0install.bat" %2
exit /b %errorlevel%

:show_status
echo == 服务状态 ==
call :is_backend_running
if errorlevel 1 (
    echo   [已停止] 后端服务
) else (
    for /f "usebackq delims=" %%p in ("%BACKEND_PID%") do echo   [运行中] 后端服务 (PID %%p^)  http://localhost:%PORT%
)
exit /b 0

:do_restart
echo == 正在重启 ==
call "%~dp0stop.bat" nopause
echo.
echo == 重新启动 ==
set "MODE=start"
goto start_flow_entry

:usage
echo 用法: %~nx0 [start ^| status ^| restart ^| install]
echo.
echo 命令说明:
echo   (无参数)       启动服务(默认)
echo   status         查看运行状态
echo   restart        重启服务
echo   install        仅安装环境
pause
exit /b 1

rem ============================================================
rem 子过程
rem ============================================================

rem 检查后端是否在运行: 0 = 运行中, 1 = 未运行
:is_backend_running
if not exist "%BACKEND_PID%" exit /b 1
set "CHK_PID="
for /f "usebackq delims=" %%p in ("%BACKEND_PID%") do set "CHK_PID=%%p"
if "%CHK_PID%"=="" exit /b 1
tasklist /fi "PID eq %CHK_PID%" 2>nul | find /i "node.exe" >nul
if errorlevel 1 exit /b 1
exit /b 0

rem 检查环境是否就绪: 0 = 就绪, 1 = 缺失(node / 后端依赖 / 前端构建产物)
:check_env
where node >nul 2>&1
if errorlevel 1 exit /b 1
if not exist "%BACKEND_DIR%\node_modules" exit /b 1
if not exist "%~dp0frontend\dist\index.html" exit /b 1
exit /b 0
