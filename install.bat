@echo off
chcp 65001 >nul
setlocal

rem ============================================================
rem 教师兼班主任工作台 - Windows 一键环境安装脚本
rem
rem 用法: 双击运行 install.bat
rem       install.bat nopause  (内部调用, 结束时不暂停窗口)
rem 功能: 检测/自动安装 Node.js -> 安装后端依赖 -> 构建前端
rem
rem 说明:
rem   - 脚本可重复执行(幂等): 已安装的部分会自动跳过
rem   - Node.js 自动安装顺序: 已安装检测 -> winget -> MSI 静默安装
rem   - MSI 安装需要管理员权限, 会自动弹出 UAC 提权窗口
rem   - 全部失败时给出手动安装指引
rem ============================================================

rem nopause: 供 start.bat 自动调用时跳过结束暂停
set "NOPAUSE=%~1"

rem Node.js 下载地址(固定 LTS 版本, 需要升级时改这里)
set "NODE_VERSION=v22.14.0"
set "NODE_MSI_URL=https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-x64.msi"
set "NODE_MSI=%TEMP%\node-%NODE_VERSION%-x64.msi"
set "NODE_DIR=C:\Program Files\nodejs"

cd /d "%~dp0"

echo ======================================================
echo  教师兼班主任工作台 - Windows 环境安装
echo ======================================================
echo.

rem ---------------- [1/3] 检测/安装 Node.js ----------------
echo == [1/3] 检测运行环境 ==

call :check_node
if %errorlevel%==0 goto node_ready

rem Node.js 缺失或版本过低 -> 尝试自动安装
echo   [!] 未检测到 Node.js 或版本低于 18, 开始自动安装...

rem 已安装但当前会话 PATH 不可见时, 补充默认安装路径
if exist "%NODE_DIR%\node.exe" set "PATH=%PATH%;%NODE_DIR%"
call :check_node
if %errorlevel%==0 goto node_ready

rem ---- 方式一: winget 安装(提权由 winget 自行处理) ----
where winget >nul 2>&1
if errorlevel 1 goto try_msi
echo   正在使用 winget 安装 Node.js LTS (可能弹出提权确认窗口)...
winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements
if exist "%NODE_DIR%\node.exe" set "PATH=%PATH%;%NODE_DIR%"
call :check_node
if %errorlevel%==0 goto node_ready

rem ---- 方式二: 下载 MSI 静默安装(需要管理员权限) ----
:try_msi
echo   正在下载 Node.js 安装包(约 30MB, 请耐心等待)...
curl -fsSL -o "%NODE_MSI%" "%NODE_MSI_URL%"
if errorlevel 1 goto node_manual
if not exist "%NODE_MSI%" goto node_manual

rem 检查管理员权限, 不足则自动提权重启本脚本(安装完成后自动继续后续步骤)
net session >nul 2>&1
if errorlevel 1 goto elevate
msiexec /i "%NODE_MSI%" /qn /norestart
if errorlevel 1 goto node_manual
if exist "%NODE_DIR%\node.exe" set "PATH=%PATH%;%NODE_DIR%"
call :check_node
if %errorlevel%==0 goto node_ready
goto node_manual

:elevate
echo   需要管理员权限安装 Node.js, 请在弹出的 UAC 窗口中点击"是"...
echo   安装将在新窗口中进行, 完成后请在那个窗口按任意键, 本窗口会自动继续...
rem -Wait: 等待提权窗口中的安装完成后, 本窗口再继续后续步骤
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs -Wait"
if errorlevel 1 goto node_manual
rem 提权安装完成后, 刷新 PATH 并重新校验
if exist "%NODE_DIR%\node.exe" set "PATH=%PATH%;%NODE_DIR%"
call :check_node
if %errorlevel%==0 goto node_ready
goto node_manual

:node_manual
echo.
echo   [!] Node.js 自动安装失败
echo       请手动下载安装 18 或以上 LTS 版本:
echo       https://nodejs.org/zh-cn
echo       安装完成后重新运行 install.bat
echo ======================================================
call :mpause
exit /b 1

:node_ready
echo   [OK] Node.js 已就绪:
for /f "delims=" %%v in ('node -v 2^>nul') do echo       %%v
where npm >nul 2>&1
if errorlevel 1 (
    echo   [!] 未检测到 npm, 请手动安装 Node.js 后重试
    call :mpause
    exit /b 1
)
echo.

rem ---------------- [2/3] 安装后端依赖 ----------------
echo == [2/3] 安装后端依赖 ==
cd /d "%~dp0backend"
if exist node_modules (
    echo   [OK] 后端依赖已存在, 跳过安装
) else (
    echo   正在安装后端依赖(可能需要几分钟)...
    call npm install --registry=https://registry.npmjs.org
    if not exist node_modules (
        echo   [失败] 后端依赖安装失败, 请检查网络后重新运行 install.bat
        call :mpause
        exit /b 1
    )
    echo   [OK] 后端依赖安装完成
)
echo.

rem ---------------- [3/3] 安装前端依赖并构建 ----------------
echo == [3/3] 构建前端 ==
cd /d "%~dp0frontend"
if exist node_modules (
    echo   [OK] 前端依赖已存在, 跳过安装
) else (
    echo   正在安装前端依赖(可能需要几分钟)...
    call npm install --registry=https://registry.npmjs.org
    if not exist node_modules (
        echo   [失败] 前端依赖安装失败, 请检查网络后重新运行 install.bat
        call :mpause
        exit /b 1
    )
    echo   [OK] 前端依赖安装完成
)
if exist dist\index.html (
    echo   [OK] 前端已构建, 跳过(如需重新构建请删除 frontend\dist 目录)
) else (
    echo   正在构建前端...
    call npm run build
    if not exist dist\index.html (
        echo   [失败] 前端构建失败, 请查看上方错误信息
        call :mpause
        exit /b 1
    )
    echo   [OK] 前端构建完成
)

echo.
echo ======================================================
echo  环境安装完成!
echo  双击 start.bat 启动服务, 然后访问 http://localhost:3000
echo  默认账号: admin / admin123
echo ======================================================
call :mpause
exit /b 0

rem ---------------- 子过程: 检测 Node.js 是否可用且版本 >= 18 ----------------
rem 返回码: 0 = 可用, 1 = 不可用
:check_node
where node >nul 2>&1
if errorlevel 1 exit /b 1
set "NODE_MAJOR="
for /f "tokens=1 delims=v." %%a in ('node -v 2^>nul') do set "NODE_MAJOR=%%a"
if not defined NODE_MAJOR exit /b 1
if %NODE_MAJOR% LSS 18 exit /b 1
exit /b 0

rem ---------------- 子过程: 结束前暂停(双击运行时暂停查看结果, nopause 时跳过) ----------------
:mpause
if /i not "%NOPAUSE%"=="nopause" pause
exit /b 0
