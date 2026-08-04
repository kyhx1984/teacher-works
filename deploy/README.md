# 部署说明

本系统为前后端分离架构：前端为纯静态资源（Vue3 构建产物），后端为 Node.js + Express + SQLite。

## 一、一键构建

在项目根目录执行：

```bash
chmod +x build.sh
./build.sh
```

构建产物：
- `frontend/dist/` — 前端静态资源
- `backend/` — 后端服务（含 `node_modules`、`database.sqlite`、`uploads/`）
- `deploy/nginx/nginx.conf.example` — Nginx 配置样例

## 二、部署后端

```bash
cd backend
# 方式一：直接运行
npm start
# 方式二：使用 PM2 守护进程（推荐生产环境）
npm install -g pm2
pm2 start server.js --name teacher-ops
pm2 save && pm2 startup
```

后端默认监听 `3000` 端口，可通过环境变量修改：

```bash
PORT=8080 npm start
```

数据文件：`backend/database.sqlite`（首次启动自动建表）。
上传文件存放于 `backend/uploads/`。

## 三、部署前端 + Nginx

1. 将 `frontend/dist/` 拷贝到服务器，例如 `/opt/teacher_ops/frontend/dist`。
2. 将 `deploy/nginx/nginx.conf` 按注释修改域名/路径后复制到 Nginx 配置目录。
3. 重新加载 Nginx：

```bash
sudo cp deploy/nginx/nginx.conf /etc/nginx/conf.d/teacher_ops.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 四、反向代理说明

- `/` 和 `/assets/` → 前端静态资源（Nginx 直接返回）
- `/api/` → 反向代理到后端 `http://127.0.0.1:3000`
- `/uploads/` → 反向代理到后端，用于资源文件的预览/下载

## 五、常用运维

- 查看后端日志：`pm2 logs teacher-ops`
- 备份数据：直接备份 `backend/database.sqlite` 与 `backend/uploads/` 即可
- 健康检查：`curl http://127.0.0.1:3000/api/v1/health`
