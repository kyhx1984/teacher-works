#!/usr/bin/env bash
###############################################################################
# 一键启动脚本 (支持首次安装自动配置环境 / Docker 部署)
#
# 用法:
#   ./start.sh           启动后端服务(生产模式, 前端由后端托管)
#   ./start.sh --dev     启动后端 + 前端 Vite 开发服务(本地开发)
#   ./start.sh --docker  使用 Docker 部署(推荐用于生产环境)
#   ./start.sh status    查看运行状态
#   ./start.sh restart   重启已启动的服务
#   ./start.sh install   仅安装环境(检查并安装 Node.js 和依赖)
#
# 说明:
#   - 首次启动自动检查并安装 Node.js 环境(需联网)
#   - 后端服务运行于 3000 端口, 日志: logs/backend.log
#   - 前端开发服务运行于 5173 端口, 日志: logs/frontend.log
#   - 进程 PID 记录在 run/ 目录, 使用 ./stop.sh 一键停止
#   - Docker 模式: 自动安装 Docker、构建镜像、启动容器、开机自启、异常重启
###############################################################################

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/run"
LOG_DIR="$ROOT_DIR/logs"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"
PORT="${PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

mkdir -p "$RUN_DIR" "$LOG_DIR"

# 启用作业控制, 使后台进程独立成组(PGID)。
set -m

# Apple Silicon (M 系列芯片) 下, bash 执行的 node 可能走 Rosetta(x64) 兜底,
# 导致 sqlite3/rollup 等原生绑定加载失败。这里统一强制使用原生 arm64 架构。
run_native() {
  local is_apple_silicon=0
  if [ "$(uname -s)" = "Darwin" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
    is_apple_silicon=1
  fi
  if [ "$is_apple_silicon" = "1" ]; then
    arch -arm64 "$@"
  else
    "$@"
  fi
}

# 显示版本信息
show_version() {
  if [ -f "$ROOT_DIR/VERSION.txt" ]; then
    echo "======================================================"
    cat "$ROOT_DIR/VERSION.txt"
    echo "======================================================"
    echo ""
  fi
}

# 检查并安装 Node.js 环境
check_and_install_node() {
  echo "== 检查运行环境 =="

  # 检查 Node.js
  if command -v node &> /dev/null; then
    local node_version
    node_version="$(node -v)"
    echo "  [✓] Node.js 已安装: $node_version"

    # 检查版本是否满足要求 (需要 Node.js 18+)
    local major_version
    major_version="$(echo "$node_version" | sed -E 's/v([0-9]+)\..*/\1/')"
    if [ "$major_version" -lt 18 ]; then
      echo "  [!] Node.js 版本过低，需要 v18 或更高版本"
      echo "      当前版本: $node_version"
      echo "      请访问 https://nodejs.org/ 下载安装 LTS 版本"
      exit 1
    fi
  else
    echo "  [!] 未检测到 Node.js"
    echo ""
    echo "  正在尝试自动安装 Node.js..."
    echo ""

    # 检测操作系统并安装
    local os_type
    os_type="$(uname -s)"

    case "$os_type" in
      Darwin)
        # macOS
        if command -v brew &> /dev/null; then
          echo "  使用 Homebrew 安装 Node.js..."
          brew install node@20
          brew link --overwrite node@20
        else
          echo "  [!] 未检测到 Homebrew"
          echo "      请先安装 Homebrew: /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
          echo "      或手动下载 Node.js: https://nodejs.org/"
          exit 1
        fi
        ;;
      Linux)
        # Linux
        if command -v apt-get &> /dev/null; then
          # Debian/Ubuntu
          echo "  使用 apt 安装 Node.js..."
          curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
          sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
          # CentOS/RHEL
          echo "  使用 yum 安装 Node.js..."
          curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
          sudo yum install -y nodejs
        elif command -v dnf &> /dev/null; then
          # Fedora
          echo "  使用 dnf 安装 Node.js..."
          curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
          sudo dnf install -y nodejs
        else
          echo "  [!] 无法识别包管理器，请手动安装 Node.js"
          echo "      下载地址: https://nodejs.org/"
          exit 1
        fi
        ;;
      *)
        echo "  [!] 不支持的操作系统: $os_type"
        echo "      请手动安装 Node.js: https://nodejs.org/"
        exit 1
        ;;
    esac

    # 验证安装
    if command -v node &> /dev/null; then
      echo "  [✓] Node.js 安装成功: $(node -v)"
    else
      echo "  [!] Node.js 安装失败，请手动安装"
      exit 1
    fi
  fi

  # 检查 npm
  if command -v npm &> /dev/null; then
    echo "  [✓] npm 已安装: $(npm -v)"
  else
    echo "  [!] 未检测到 npm，请手动安装 Node.js"
    exit 1
  fi

  echo ""
}

# 安装后端依赖
install_backend_deps() {
  echo "== 安装后端依赖 =="
  cd "$BACKEND_DIR"

  if [ ! -d "node_modules" ]; then
    echo "  正在安装后端依赖..."
    run_native npm install --registry=https://registry.npmjs.org
    echo "  [✓] 后端依赖安装完成"
  else
    echo "  [✓] 后端依赖已存在"
  fi
  echo ""
}

# 安装前端依赖(仅开发模式需要)
install_frontend_deps() {
  echo "== 安装前端依赖 =="
  cd "$FRONTEND_DIR"

  if [ ! -d "node_modules" ]; then
    echo "  正在安装前端依赖..."
    run_native npm install --registry=https://registry.npmjs.org
    echo "  [✓] 前端依赖安装完成"
  else
    echo "  [✓] 前端依赖已存在"
  fi
  echo ""
}

# 一键安装环境
install_all() {
  show_version
  check_and_install_node
  install_backend_deps
  echo "======================================================"
  echo " 环境安装完成！"
  echo " 运行 ./start.sh 启动服务"
  echo "======================================================"
}

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] || return 1
  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

wait_ready() {
  local url="$1"
  local retries=30
  for _ in $(seq 1 "$retries"); do
    if curl -s -o /dev/null --max-time 2 "$url"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_backend() {
  if is_running "$BACKEND_PID"; then
    echo "  后端已在运行 (PID $(cat "$BACKEND_PID"))"
    return 0
  fi

  # 首次启动时检查环境并安装依赖
  check_and_install_node
  install_backend_deps

  # 确保上传目录存在
  mkdir -p "$BACKEND_DIR/uploads"

  echo "  正在启动后端服务..."
  cd "$BACKEND_DIR"
  run_native node server.js > "$LOG_DIR/backend.log" 2>&1 &
  echo $! > "$BACKEND_PID"

  if wait_ready "http://127.0.0.1:$PORT/api/v1/health"; then
    echo "  后端服务启动成功 -> http://localhost:$PORT  (PID $(cat "$BACKEND_PID"))"
  else
    echo "  [警告] 后端健康检查未通过, 请查看日志: logs/backend.log"
    echo "  ---- 日志尾部 ----"
    tail -n 20 "$LOG_DIR/backend.log" 2>/dev/null || true
    return 1
  fi
}

start_frontend() {
  if is_running "$FRONTEND_PID"; then
    echo "  前端开发服务已在运行 (PID $(cat "$FRONTEND_PID"))"
    return 0
  fi

  echo "  正在启动前端开发服务..."
  cd "$FRONTEND_DIR"
  if [ ! -d "node_modules" ]; then
    echo "  前端依赖未安装, 正在安装..."
    run_native npm install --registry=https://registry.npmjs.org
  fi
  run_native node node_modules/vite/bin/vite.js --port "$FRONTEND_PORT" > "$LOG_DIR/frontend.log" 2>&1 &
  echo $! > "$FRONTEND_PID"

  sleep 3
  if is_running "$FRONTEND_PID"; then
    echo "  前端开发服务启动成功 -> http://localhost:$FRONTEND_PORT  (PID $(cat "$FRONTEND_PID"))"
  else
    echo "  [警告] 前端开发服务启动失败, 请查看日志: logs/frontend.log"
    tail -n 20 "$LOG_DIR/frontend.log" 2>/dev/null || true
    return 1
  fi
}

stop_all() {
  "$ROOT_DIR/stop.sh"
}

show_status() {
  echo "== 服务状态 =="
  if is_running "$BACKEND_PID"; then
    echo "  [运行中] 后端服务 (PID $(cat "$BACKEND_PID"))  http://localhost:$PORT"
  else
    echo "  [已停止] 后端服务"
  fi
  if is_running "$FRONTEND_PID"; then
    echo "  [运行中] 前端开发服务 (PID $(cat "$FRONTEND_PID"))  http://localhost:$FRONTEND_PORT"
  else
    echo "  [已停止] 前端开发服务"
  fi
}

MODE="${1:-prod}"
case "$MODE" in
  --docker|docker)
    show_version
    if [ -f "$ROOT_DIR/deploy.sh" ]; then
      shift
      exec "$ROOT_DIR/deploy.sh" "$@"
    else
      echo "[错误] 未找到 deploy.sh, 请确认部署包完整"
      exit 1
    fi
    ;;
  install|-i)
    install_all
    ;;
  status|-s)
    show_status
    ;;
  restart)
    echo "== 正在重启 =="
    stop_all
    echo ""
    echo "== 重新启动 =="
    start_backend
    if [ -f "$RUN_DIR/.dev" ]; then
      start_frontend
    fi
    ;;
  --dev|dev|-d)
    show_version
    echo "== 开发模式启动 =="
    touch "$RUN_DIR/.dev"
    start_backend
    start_frontend
    echo ""
    echo "提示: 浏览器访问 http://localhost:$FRONTEND_PORT"
    ;;
  prod|-p)
    show_version
    rm -f "$RUN_DIR/.dev"
    echo "== 生产模式启动 =="
    start_backend
    echo ""
    if [ -f "$FRONTEND_DIR/dist/index.html" ]; then
      echo "提示: 后端已托管前端页面, 请直接访问 http://localhost:$PORT"
    else
      echo "提示: 未检测到前端构建产物, 请先执行 ./build.sh 后再访问;"
      echo "      或使用 ./start.sh --dev 启动开发服务。"
    fi
    ;;
  *)
    echo "用法: $0 [install | --dev | --docker | status | restart]"
    echo ""
    echo "命令说明:"
    echo "  install, -i    仅安装环境(检查并安装 Node.js 和依赖)"
    echo "  status, -s     查看运行状态"
    echo "  restart        重启已启动的服务"
    echo "  --dev, -d      启动开发模式(后端 + 前端 Vite)"
    echo "  --docker       Docker 部署(推荐用于生产环境, 自动安装 Docker/构建/启动)"
    echo "  prod, -p       启动生产模式(默认)"
    exit 1
    ;;
esac
