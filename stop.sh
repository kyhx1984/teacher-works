#!/usr/bin/env bash
###############################################################################
# 一键停止脚本
#
# 用法:
#   ./stop.sh          停止所有由 start.sh 启动的服务(后端 + 前端开发服务)
#   ./stop.sh backend  仅停止后端
#   ./stop.sh frontend 仅停止前端开发服务
###############################################################################

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/run"
BACKEND_PID="$RUN_DIR/backend.pid"
FRONTEND_PID="$RUN_DIR/frontend.pid"

stop_pid() {
  local pid_file="$1"
  local name="$2"

  if [ ! -f "$pid_file" ]; then
    echo "  [跳过] $name 未在运行"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  rm -f "$pid_file"

  if [ -z "$pid" ]; then
    echo "  [跳过] $name 未在运行"
    return 0
  fi

  # 以进程组方式结束: start.sh 使用 `set -m` 让每个服务独立成组，
  # `kill -- -PID` 可连同 `arch -arm64` fork 出的真实 node 子进程一并结束。
  if kill -0 "$pid" 2>/dev/null; then
    if ! kill -- "-$pid" 2>/dev/null && ! kill "$pid" 2>/dev/null; then
      echo "  [失败] 无法结束 $name (PID $pid)"
      return 1
    fi
    # 等待优雅退出, 最多 10 秒
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$pid" 2>/dev/null; then
      # 组内可能仍有子进程存活, 强制结束
      kill -- "-$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null
      echo "  [强制] $name 已强制停止 (PID $pid)"
    else
      echo "  [已停止] $name (PID $pid)"
    fi
  else
    echo "  [已停止] $name 进程不存在"
  fi
}

echo "== 停止服务 =="

TARGET="${1:-all}"
case "$TARGET" in
  all)
    stop_pid "$FRONTEND_PID" "前端开发服务"
    stop_pid "$BACKEND_PID" "后端服务"
    ;;
  backend)
    stop_pid "$BACKEND_PID" "后端服务"
    ;;
  frontend)
    stop_pid "$FRONTEND_PID" "前端开发服务"
    ;;
  *)
    echo "用法: $0 [all | backend | frontend]"
    exit 1
    ;;
esac

echo "== 全部服务已停止 =="
