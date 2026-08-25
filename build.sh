#!/usr/bin/env bash
###############################################################################
# 教师兼班主任工作台 - 一键编译打包脚本
#
# 用法:
#   chmod +x build.sh
#   ./build.sh            构建前端并打包便携部署包(推荐, 跨平台)
#   ./build.sh --full     额外附带后端 node_modules(仅限与打包机同平台离线部署)
#
#   产物:
#   release/teacher-ops-<版本>-<日期>.tar.gz   (Linux/macOS/Docker 部署)
#   release/teacher-ops-<版本>-<日期>.zip      (Windows 部署, 资源管理器可直接双击解压)
#
# 部署:
#   1. 将 release/*.tar.gz 上传到云服务器
#   2. tar -xzf teacher-ops-*.tar.gz
#   3. cd teacher-ops && ./start.sh     # 首次启动自动安装后端依赖
#   4. 浏览器访问 http://服务器IP:3000
#   停止: ./stop.sh
#
# 说明:
#   - 便携包(默认)不包含 node_modules, 跨平台通用, 首次启动时 start.sh 自动执行 npm install
#   - --full 包含后端 node_modules, 用于无外网的同平台服务器; 原生模块(sqlite3)与架构绑定,
#     切勿将 Mac/arm64 打出的 full 包放到 Linux/x64 服务器上
###############################################################################

set -e

echo "======================================================"
echo " 教师兼班主任工作台 - 一键构建与打包"
echo "======================================================"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
RELEASE_DIR="$ROOT_DIR/release"
STAGE_DIR="$ROOT_DIR/.stage"
VERSION="1.0.0"
# 精确到秒的时间戳，避免同一天多次打包冲突
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="teacher-ops-${VERSION}-${TIMESTAMP}"
INCLUDE_NODE_MODULES=0

# 解决 macOS Apple Silicon 下 Rosetta 导致的架构不匹配问题
# 注意: npm 的安装脚本子进程按 PATH 重新解析 node, 因此必须同时把 arm64 通用
# node 所在目录提到 PATH 最前, 否则 arch -arm64 只作用于外层命令, 子进程仍会
# 拿到 x86_64 node, 装出错误架构的原生模块(sqlite3/rollup)
run_native() {
  if [ "$(uname -s)" = "Darwin" ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
    arch -arm64 env PATH="/usr/local/bin:/opt/homebrew/bin:$PATH" "$@"
  else
    "$@"
  fi
}

[ "$1" = "--full" ] && INCLUDE_NODE_MODULES=1

echo ""
echo "[1/5] 构建前端..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
  run_native npm install --registry=https://registry.npmjs.org
else
  echo "      前端依赖已存在"
fi
run_native npm run build
echo "     前端构建完成 -> $FRONTEND_DIR/dist"

echo "[2/5] 安装后端依赖(用于本地验证与 --full 打包)..."
cd "$BACKEND_DIR"
if [ ! -d "node_modules" ]; then
  run_native npm install --registry=https://registry.npmjs.org
else
  echo "      后端依赖已存在"
fi

echo "[3/5] 组装部署目录..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/teacher-ops/frontend" "$STAGE_DIR/teacher-ops/backend/uploads" "$STAGE_DIR/teacher-ops/deploy" "$STAGE_DIR/teacher-ops/logs"

# 后端代码(剔除 node_modules / 运行时产物, 首次 start.sh 自动安装依赖)
cp -R "$BACKEND_DIR/." "$STAGE_DIR/teacher-ops/backend/"
rm -rf "$STAGE_DIR/teacher-ops/backend/node_modules"
rm -f "$STAGE_DIR/teacher-ops/backend/database.sqlite"
rm -rf "$STAGE_DIR/teacher-ops/backend/uploads"
mkdir -p "$STAGE_DIR/teacher-ops/backend/uploads"
rm -f "$STAGE_DIR/teacher-ops/backend/.gitignore"

# 前端构建产物
cp -R "$FRONTEND_DIR/dist" "$STAGE_DIR/teacher-ops/frontend/dist"

# 仅打包运行必需文件: 启停脚本(mac/Linux + Windows) + Docker 部署文件 + Nginx 样例 + 使用说明
cp -f "$ROOT_DIR/start.sh" "$ROOT_DIR/stop.sh" "$ROOT_DIR/deploy.sh" "$ROOT_DIR/entrypoint.sh" "$STAGE_DIR/teacher-ops/"
cp -f "$ROOT_DIR/install.bat" "$ROOT_DIR/start.bat" "$ROOT_DIR/stop.bat" "$STAGE_DIR/teacher-ops/"
cp -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR/.dockerignore" "$ROOT_DIR/docker-compose.yml" "$STAGE_DIR/teacher-ops/"
cp -f "$ROOT_DIR/deploy/nginx.conf" "$STAGE_DIR/teacher-ops/deploy/"
cp -f "$ROOT_DIR/README.md" "$STAGE_DIR/teacher-ops/" 2>/dev/null || true

# 确保 Windows 批处理脚本为 CRLF 换行(cmd.exe 要求, LF 会导致 goto 失效)
# 并再次排除 macOS 的 ._ 隐藏文件
for bat in "$STAGE_DIR/teacher-ops/"*.bat; do
  perl -i -pe 's/\r?\n/\r\n/' "$bat"
done

# 确保脚本可执行
chmod +x "$STAGE_DIR/teacher-ops/"*.sh

# 创建版本信息文件
cat > "$STAGE_DIR/teacher-ops/VERSION.txt" <<EOF
教师兼班主任工作台 - 版本信息
================================
版本号: $VERSION
构建时间: $(date '+%Y-%m-%d %H:%M:%S')
构建机器: $(hostname)
系统架构: $(uname -m)
Node版本: $(node -v 2>/dev/null || echo "未安装")

部署说明:
【Docker 部署】(推荐)
1. 解压: tar -xzf $ARCHIVE.tar.gz
2. 进入目录: cd teacher-ops
3. 一键部署: ./deploy.sh (自动安装 Docker、构建镜像、启动容器)
4. 访问: http://服务器IP:3000

升级流程:
1. 解压新版本: tar -xzf teacher-ops-*.tar.gz (覆盖旧代码)
2. 重启容器: docker compose restart
3. 完成！无需重新构建镜像

【直接部署】(需要 Node.js 环境)
1. 解压: tar -xzf $ARCHIVE.tar.gz
2. 进入目录: cd teacher-ops
3. 一键启动: ./start.sh (首次启动自动安装依赖)
4. 访问: http://服务器IP:3000

【Windows 部署】(Win10 1803+ / Win11)
1. 解压: 双击 teacher-ops-*.zip 用资源管理器解压(或 tar -xzf *.tar.gz)
2. 进入解压后的 teacher-ops 目录
3. 双击 install.bat (自动安装 Node.js 环境与依赖)
4. 双击 start.bat 启动, 访问: http://localhost:3000
5. 停止服务: 双击 stop.bat
EOF
chmod 644 "$STAGE_DIR/teacher-ops/VERSION.txt"

if [ "$INCLUDE_NODE_MODULES" = "1" ]; then
  echo "      [--full] 附带后端 node_modules..."
  cp -R "$BACKEND_DIR/node_modules" "$STAGE_DIR/teacher-ops/backend/node_modules"
fi

echo "[4/5] 打包压缩..."
mkdir -p "$RELEASE_DIR"
cd "$STAGE_DIR"

# Windows 用 zip 包(资源管理器可直接双击解压); ditto 不带 ._ 文件
if command -v ditto &> /dev/null; then
  ditto -c -k --sequesterRsrc --keepParent teacher-ops "$RELEASE_DIR/$ARCHIVE.zip"
elif command -v zip &> /dev/null; then
  zip -r -q -x '._*' "$RELEASE_DIR/$ARCHIVE.zip" teacher-ops
else
  echo "      [警告] 未找到 zip 工具, 跳过 Windows zip 包(可用: brew install zip)"
fi

# Linux/macOS/Docker 用 tar.gz 包, 排除 macOS 生成的 ._ 隐藏文件
tar --exclude='._*' -czf "$RELEASE_DIR/$ARCHIVE.tar.gz" teacher-ops
rm -rf "$STAGE_DIR"

# 生成校验和文件(tar.gz 与 zip 各一份)
echo "[5/5] 生成校验和..."
cd "$RELEASE_DIR"
for ARTIFACT in "$ARCHIVE.tar.gz" "$ARCHIVE.zip"; do
  [ -f "$ARTIFACT" ] || continue
  if command -v shasum &> /dev/null; then
    shasum -a 256 "$ARTIFACT" > "$ARTIFACT.sha256"
  elif command -v md5 &> /dev/null; then
    md5 "$ARTIFACT" > "$ARTIFACT.md5"
  fi
done
if [ -f "$ARCHIVE.tar.gz.sha256" ]; then
  echo "      tar.gz SHA256: $(cut -d' ' -f1 $ARCHIVE.tar.gz.sha256)"
fi

echo ""
echo "==================== 打包完成 ===================="
echo "  文件: release/$ARCHIVE.tar.gz  ($(du -sh "$RELEASE_DIR/$ARCHIVE.tar.gz" | cut -f1))"
[ -f "$RELEASE_DIR/$ARCHIVE.zip" ] && echo "  文件: release/$ARCHIVE.zip  ($(du -sh "$RELEASE_DIR/$ARCHIVE.zip" | cut -f1)) [Windows 用]"
echo "  版本: $VERSION"
echo "  构建时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "  Docker 部署（推荐）:"
echo "    1. 上传 release/$ARCHIVE.tar.gz 到服务器"
echo "    2. tar -xzf $ARCHIVE.tar.gz && cd teacher-ops"
echo "    3. ./deploy.sh"
echo ""
echo "  直接部署:"
echo "    1. 上传并解压到服务器"
echo "    2. cd teacher-ops && ./start.sh"
echo ""
echo "  Windows 部署:"
echo "    1. 下载 $ARCHIVE.zip, 解压后进入 teacher-ops 目录"
echo "    2. 双击 install.bat 后, 双击 start.bat"
echo ""
if [ "$INCLUDE_NODE_MODULES" = "1" ]; then
  echo "  [注意] 包含 node_modules, 仅限同平台/同架构服务器"
else
  echo "  [提示] 便携包不含 node_modules, 首次启动自动安装"
fi
echo "===================================================="