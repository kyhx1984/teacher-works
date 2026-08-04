#!/usr/bin/env bash
###############################################################################
# 教师兼班主任工作台 - Docker 一键部署脚本
#
# 用法:
#   ./deploy.sh              一键部署(自动安装 Docker、构建镜像、启动容器)
#   ./deploy.sh rebuild      重建镜像并重启容器(升级代码后使用)
#   ./deploy.sh start        启动已停止的容器
#   ./deploy.sh stop         停止容器
#   ./deploy.sh restart      重启容器
#   ./deploy.sh status       查看容器状态和日志
#   ./deploy.sh logs         实时查看容器日志
#   ./deploy.sh uninstall    停止并删除容器和镜像
#
# 说明:
#   - 自动检测并安装 Docker(支持 Ubuntu/Debian/CentOS/RHEL/Fedora)
#   - 容器设置 restart: always，异常退出后自动重启
#   - 数据持久化到宿主机 ./data/ 目录，容器重建不丢数据
#   - 升级流程: 解压新版本 -> ./deploy.sh rebuild -> 完成
###############################################################################

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_NAME="teacher-ops"
IMAGE_NAME="teacher-ops:latest"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 显示版本信息
show_version() {
  if [ -f "$ROOT_DIR/VERSION.txt" ]; then
    echo "======================================================"
    cat "$ROOT_DIR/VERSION.txt"
    echo "======================================================"
    echo ""
  fi
}

# 检查并安装 Docker
install_docker() {
  if command -v docker &> /dev/null; then
    log_info "Docker 已安装: $(docker --version)"

    # 检查 Docker 是否运行
    if ! docker info &> /dev/null; then
      log_warn "Docker 未运行，正在启动..."
      sudo systemctl start docker
      sudo systemctl enable docker
    fi
    return 0
  fi

  log_warn "未检测到 Docker，正在自动安装..."
  echo ""

  local os_type
  os_type="$(uname -s)"

  case "$os_type" in
    Linux)
      if command -v apt-get &> /dev/null; then
        # Debian/Ubuntu
        log_info "使用 apt 安装 Docker..."
        sudo apt-get update -y
        sudo apt-get install -y ca-certificates curl gnupg lsb-release

        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg | \
          sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        sudo chmod a+r /etc/apt/keyrings/docker.gpg

        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
          https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

        sudo apt-get update -y
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

      elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        log_info "使用 yum 安装 Docker..."
        sudo yum install -y yum-utils
        sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

      elif command -v dnf &> /dev/null; then
        # Fedora
        log_info "使用 dnf 安装 Docker..."
        sudo dnf install -y dnf-plugins-core
        sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
        sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      else
        # 使用官方一键安装脚本
        log_info "使用官方脚本安装 Docker..."
        curl -fsSL https://get.docker.com | sudo bash
      fi

      # 启动 Docker 并设置开机自启
      sudo systemctl start docker
      sudo systemctl enable docker
      log_info "Docker 安装完成并已设置为开机自启"

      # 将当前用户加入 docker 组(可选，避免每次 sudo)
      if ! groups | grep -q docker; then
        sudo usermod -aG docker "$USER" 2>/dev/null || true
        log_warn "已将 $USER 加入 docker 组，重新登录后生效"
      fi
      ;;
    *)
      log_error "不支持的操作系统: $os_type，请手动安装 Docker"
      exit 1
      ;;
  esac

  # 验证安装
  if command -v docker &> /dev/null && docker info &> /dev/null; then
    log_info "Docker 安装成功: $(docker --version)"
  else
    log_error "Docker 安装失败，请手动安装后重试"
    exit 1
  fi
}

# 检查并安装 docker compose
ensure_compose() {
  # 优先使用 docker compose (V2 插件)
  if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    return 0
  fi

  # 回退到 docker-compose (V1)
  if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    return 0
  fi

  log_warn "未检测到 docker compose，正在安装..."
  sudo apt-get install -y docker-compose-plugin 2>/dev/null || \
  sudo yum install -y docker-compose-plugin 2>/dev/null || \
  sudo dnf install -y docker-compose-plugin 2>/dev/null || {
    # 手动下载
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  }

  if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
  elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    log_error "docker compose 安装失败"
    exit 1
  fi
}

# 创建数据持久化目录
init_data_dirs() {
  mkdir -p "$ROOT_DIR/data/uploads"
  # 如果数据库文件不存在，创建空文件(避免 Docker 挂载为目录)
  touch "$ROOT_DIR/data/database.sqlite"
  mkdir -p "$ROOT_DIR/logs"
}

# 构建镜像
build_image() {
  log_info "正在构建 Docker 镜像..."
  cd "$ROOT_DIR"
  $COMPOSE_CMD build --no-cache
  log_info "镜像构建完成"
}

# 启动容器
start_container() {
  log_info "正在启动容器..."
  cd "$ROOT_DIR"
  init_data_dirs
  $COMPOSE_CMD up -d
  log_info "容器启动完成"
  echo ""
  echo "======================================================"
  log_info "服务已启动!"
  echo "  访问地址: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo '服务器IP'):3000"
  echo "  容器名称: $CONTAINER_NAME"
  echo "  数据目录: $ROOT_DIR/data/"
  echo "  日志目录: $ROOT_DIR/logs/"
  echo ""
  echo "  常用命令:"
  echo "    ./deploy.sh status     查看状态"
  echo "    ./deploy.sh logs       查看日志"
  echo "    ./deploy.sh restart    重启容器"
  echo "    ./deploy.sh rebuild    重建镜像(升级后使用)"
  echo "======================================================"
}

# 停止容器
stop_container() {
  log_info "正在停止容器..."
  cd "$ROOT_DIR"
  $COMPOSE_CMD down
  log_info "容器已停止"
}

# 重启容器
restart_container() {
  log_info "正在重启容器..."
  cd "$ROOT_DIR"
  $COMPOSE_CMD restart
  log_info "容器已重启"
}

# 重建镜像并重启(升级流程)
rebuild_and_restart() {
  log_info "正在重启容器（代码通过挂载更新，无需重建镜像）..."
  cd "$ROOT_DIR"
  $COMPOSE_CMD restart
  log_info "容器已重启，代码已更新"
}

# 查看状态
show_status() {
  echo "======================================================"
  echo " 容器状态"
  echo "======================================================"
  docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo " 镜像信息:"
  docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"
  echo ""
  echo " 数据目录:"
  echo "   数据库: $ROOT_DIR/data/database.sqlite"
  echo "   上传文件: $ROOT_DIR/data/uploads/"
  echo "   日志: $ROOT_DIR/logs/"
  echo "======================================================"
}

# 查看日志
show_logs() {
  cd "$ROOT_DIR"
  $COMPOSE_CMD logs -f --tail=100
}

# 卸载
uninstall() {
  log_warn "正在卸载..."
  cd "$ROOT_DIR"
  $COMPOSE_CMD down --rmi all --volumes
  log_info "容器和镜像已删除"
  log_warn "数据目录 $ROOT_DIR/data/ 已保留，如需彻底删除请手动执行 rm -rf"
}

# 主入口
show_version
install_docker
ensure_compose

MODE="${1:-deploy}"
case "$MODE" in
  deploy|"")
    build_image
    start_container
    ;;
  rebuild)
    rebuild_and_restart
    ;;
  start)
    init_data_dirs
    start_container
    ;;
  stop)
    stop_container
    ;;
  restart)
    restart_container
    ;;
  status|-s)
    show_status
    ;;
  logs|-l)
    show_logs
    ;;
  uninstall)
    uninstall
    ;;
  *)
    echo "用法: $0 [deploy | rebuild | start | stop | restart | status | logs | uninstall]"
    echo ""
    echo "命令说明:"
    echo "  deploy       一键部署(默认，自动安装 Docker、构建镜像、启动容器)"
    echo "  rebuild      重建镜像并重启(升级代码后使用)"
    echo "  start        启动已停止的容器"
    echo "  stop         停止容器"
    echo "  restart      重启容器"
    echo "  status       查看容器状态"
    echo "  logs         实时查看容器日志"
    echo "  uninstall    停止并删除容器和镜像"
    exit 1
    ;;
esac
