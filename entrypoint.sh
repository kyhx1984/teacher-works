#!/bin/bash
set -e

echo "[entrypoint] 启动容器..."

# 创建持久化目录
mkdir -p /app/data/uploads

# 迁移旧版数据库（从 backend/ 目录迁移到 data/ 目录）
if [ -f "/app/backend/database.sqlite" ] && [ ! -L "/app/backend/database.sqlite" ]; then
  echo "[entrypoint] 迁移旧版数据库到 data/ 目录..."
  mv /app/backend/database.sqlite /app/data/database.sqlite
fi

# 检查依赖是否需要更新（通过 package.json 的 md5 判断）
PKG_HASH_FILE="/deps/.pkg_hash"
CURRENT_HASH=""
if command -v md5sum &>/dev/null; then
  CURRENT_HASH=$(md5sum /app/backend/package.json 2>/dev/null | cut -d' ' -f1)
elif command -v md5 &>/dev/null; then
  CURRENT_HASH=$(md5 -q /app/backend/package.json 2>/dev/null)
fi

NEED_INSTALL=0
if [ ! -d "/deps/node_modules" ] || [ -z "$(ls -A /deps/node_modules 2>/dev/null)" ]; then
  echo "[entrypoint] 首次启动，正在安装后端依赖..."
  NEED_INSTALL=1
elif [ -n "$CURRENT_HASH" ] && [ -f "$PKG_HASH_FILE" ]; then
  SAVED_HASH=$(cat "$PKG_HASH_FILE")
  if [ "$CURRENT_HASH" != "$SAVED_HASH" ]; then
    echo "[entrypoint] 检测到 package.json 变更，正在更新依赖..."
    NEED_INSTALL=1
  fi
fi

if [ "$NEED_INSTALL" = "1" ]; then
  # 复制 package.json 到 /deps 并安装依赖到命名卷
  cp /app/backend/package.json /deps/
  cp /app/backend/package-lock.json /deps/ 2>/dev/null || true
  cd /deps
  npm install --production --registry=https://registry.npmjs.org
  # 保存 hash 标记
  if [ -n "$CURRENT_HASH" ]; then
    echo "$CURRENT_HASH" > "$PKG_HASH_FILE"
  fi
  echo "[entrypoint] 后端依赖安装完成"
else
  echo "[entrypoint] 后端依赖已存在"
fi

# 启动服务
echo "[entrypoint] 启动服务..."
cd /app

# 强制替换 backend/node_modules 为符号链接，指向 Alpine 编译的依赖
# 原因：宿主机 backend/ 通过 bind mount 挂载，其中的 node_modules 可能是
# 从其他平台（Mac/Linux glibc）打包过来的，与 Alpine（musl libc）不兼容
if [ -d "/deps/node_modules" ]; then
  # 删除宿主机带来的 node_modules（如果是目录）
  if [ -d "/app/backend/node_modules" ] && [ ! -L "/app/backend/node_modules" ]; then
    echo "[entrypoint] 删除不兼容的 host node_modules..."
    rm -rf /app/backend/node_modules
  fi
  # 创建符号链接（如果不存在）
  if [ ! -e "/app/backend/node_modules" ]; then
    ln -s /deps/node_modules /app/backend/node_modules
    echo "[entrypoint] 已创建 node_modules 符号链接 -> /deps/node_modules"
  else
    echo "[entrypoint] node_modules 符号链接已存在"
  fi
else
  echo "[entrypoint] 警告: /deps/node_modules 不存在！"
fi

echo "[entrypoint] 工作目录: $(pwd)"
echo "[entrypoint] 数据库路径: ${DB_PATH:-/app/backend/database.sqlite}"

# 直接执行，错误信息会输出到容器日志
exec node backend/server.js
