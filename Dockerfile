# 教师兼班主任工作台 - Docker 镜像
# 代码通过 volume 挂载，镜像只负责提供运行环境
# 升级流程：解压新代码 -> docker compose restart

FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 安装构建依赖（Alpine 使用 musl libc，无 GLIBC 兼容性问题）
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    sqlite \
    curl \
    bash

# 复制启动脚本
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 创建必要目录
RUN mkdir -p /app/backend /app/frontend/dist /app/logs /app/run /app/data/uploads

# 设置 NODE_PATH，让 node 能从命名卷 /deps 中找到 node_modules
ENV NODE_PATH=/deps

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# 启动命令
ENTRYPOINT ["/entrypoint.sh"]
