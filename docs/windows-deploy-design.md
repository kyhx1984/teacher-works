# Windows 部署支持 - 设计文档

> 日期: 2026-08-25
> 状态: 已确认（方案 A：纯 .bat 批处理脚本，源码部署方式）

## 1. 目标

用户拿到源码后，在任意 Windows 10 (1803+) / Windows 11 x64 环境下：

1. 双击 `install.bat` —— 全自动安装 Node.js 环境、后端依赖、构建前端
2. 双击 `start.bat` —— 一键启动服务（首次运行会自动触发安装）
3. 双击 `stop.bat` —— 一键停止服务

浏览器访问 `http://localhost:3000`，默认账号 admin / admin123。

## 2. 前置结论（代码零改动）

现有代码已完全跨平台，**不需要修改任何后端/前端代码**：

- `server.js` / `db.js` 均使用 `path.join` 等跨平台 API，无 shell 依赖
- `sqlite3` 官方提供 win32-x64 预编译二进制，`npm install` 直接可用，无需 `--build-from-source`
- 前端 Vite/rollup 在 Windows 上有纯 JS 或预编译实现，无原生编译障碍
- 后端可直接托管 `frontend/dist`，单进程（node server.js）即可提供完整服务

## 3. 方案选型

| 方案 | 说明 | 结论 |
|---|---|---|
| A. 纯 .bat | 双击即用，无需修改执行策略 | **采用** |
| B. 纯 PowerShell (.ps1) | 默认执行策略拦截，双击打开记事本 | 否决 |
| C. .bat 入口 + .ps1 内核 | 双文件耦合，排错链条长 | 否决 |

说明：脚本以 .bat 为唯一用户入口；仅在「后台启动进程并捕获 PID」这一步内联调用
`powershell -Command`（单行命令不受执行策略限制，仍是单文件）。

## 4. 新增文件

| 文件 | 作用 |
|---|---|
| `install.bat` | 全自动环境安装（Node.js + 后端依赖 + 前端构建） |
| `start.bat` | 一键启动，支持 `start / status / restart` 子命令 |
| `stop.bat` | 一键停止 |

## 5. 关键机制设计

### 5.1 中文显示
- 脚本开头执行 `chcp 65001 >nul`，文件保存为 UTF-8（无 BOM）
- `chcp` 之前的行只使用 ASCII 字符

### 5.2 Node.js 自动安装（install.bat）
按优先级依次尝试，任一成功即继续：

1. **检测已有 Node.js**：`where node` + 版本号解析（主版本 ≥ 18 为合格）；
   若当前会话 PATH 不可见但 `C:\Program Files\nodejs\node.exe` 存在，则自动补 PATH
2. **winget 安装**：`winget install OpenJS.NodeJS.LTS -e --silent ...`
   （Win10/11 大多自带 winget，提权由 winget 自行处理）
3. **MSI 静默安装**：用系统自带 `curl` 下载固定版本
   `node-v22.14.0-x64.msi` → 检查管理员权限（`net session`），
   不足时通过 PowerShell `Start-Process -Verb RunAs` 自动提权重启本脚本（弹 UAC），
   然后 `msiexec /i ... /qn /norestart` 静默安装
4. **全部失败**：打印手动安装指引（nodejs.org 下载链接）并退出

安装后统一把 `C:\Program Files\nodejs` 追加到当前会话 PATH 再校验，
避免「装完了但当前 cmd 窗口不认识 node」的问题。

### 5.3 依赖安装与前端构建（install.bat）
- 后端：`backend\node_modules` 不存在时 `call npm install`（npm 是 npm.cmd，必须 `call`）
- 前端：`frontend\node_modules` 不存在时先 `call npm install`；
  `frontend\dist\index.html` 不存在时 `call npm run build`（已构建则跳过，支持重复执行幂等）

### 5.4 一键启动（start.bat）
- **防重复启动**：读取 `run\backend.pid`，用 `tasklist /fi "PID eq x"` 检查进程是否存活
- **首次自动安装**：检测到 node / 后端依赖 / 前端 dist 任一缺失时，自动 `call install.bat`
- **后台启动**：内联 PowerShell
  `Start-Process node.exe -ArgumentList server.js -WorkingDirectory backend -WindowStyle Hidden -RedirectStandardOutput/Err -PassThru`
  获取真实 PID 写入 `run\backend.pid`（与 mac/Linux 共用同一约定）
- **健康检查**：轮询 `http://127.0.0.1:3000/api/v1/health`（系统 curl，最多 30 秒，每秒一次），
  失败时打印 `logs\backend.err.log` / `backend.log` 尾部 20 行
- **成功提示**：打印访问地址和默认账号，并自动打开浏览器
- **子命令**：`start.bat status` 查看运行状态；`start.bat restart` 先停后启
  （与现有 start.sh 的用法保持一致）

### 5.5 一键停止（stop.bat）
- 读取 `run\backend.pid`，进程不存在则提示「未在运行」
- 先 `taskkill /PID x /T` 优雅结束（连同子进程树），等待最多 10 秒
- 未退出则 `taskkill /PID x /T /F` 强制结束
- 删除 PID 文件；双击运行结束时 `pause`，被 restart 调用时跳过 pause

### 5.6 运行时产物
- 日志：`logs\backend.log`（stdout）、`logs\backend.err.log`（stderr）
- PID：`run\backend.pid`
- 以上目录均已在 `.gitignore` 中忽略，无需改动

## 6. 修改的现有文件

仅 `README.md`：在「快速开始」下新增「方式三：Windows 部署」小节。

## 7. 边界与限制

- 目标系统：Windows 10 1803+ / Windows 11，x64（依赖系统自带 curl；MSI 只下载 x64 版）
- Node.js 固定下载 v22.14.0 LTS（版本号定义在脚本顶部变量，便于后续升级）
- MSI 静默安装需要管理员权限，脚本会自动弹 UAC；用户拒绝提权则退回手动指引
- Windows 上不提供 Docker 方式（Docker Desktop 依赖 WSL2，超出最小成本原则）；
  Windows 用户统一走源码直跑方式
