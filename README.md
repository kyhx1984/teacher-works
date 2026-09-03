# 教师兼班主任工作台

一站式教师工作管理系统，帮助教师高效管理学生信息、成绩、考勤、评价等日常工作。支持 Docker 一键部署、数据可视化、登录认证等商用级功能。

## 功能特性

- **多班级管理**：一位老师可管理多个班级，每个班级拥有完全独立的学生、成绩、考勤、座位、课程表等数据（每班独立数据库文件，物理隔离互不耦合）；顶栏一键切换班级，新建/重命名/删除班级带防误删保护；老用户首次升级自动将现有数据注册为「默认班级」，零迁移零感知

### 数据看板
- 班级核心数据一览（资源数、试卷数、学生数、今日请假、沟通记录等）
- 近 7 天请假趋势折线图
- 学生成绩分布饼图
- 最近班级动态时间线

### 学生管理
- 学生基本信息管理（姓名、性别、出生日期、家长联系方式等）
- 特殊学生标记与分类管理
- Excel 批量导入学生
- 花名册一键导出 Excel
- 批量删除、分页浏览

### 成绩管理
- 单条成绩录入 / 编辑 / 删除
- Excel 批量导入成绩
- 成绩单一键导出 Excel
- 成绩进退分析（平均分、最高分、最近成绩、上升/下降趋势）
- 成绩分布柱状图（按分数段统计）
- 批量删除、分页浏览

### 考勤管理
- 学生请假登记（支持上传请假条图片）
- 请假图片附件预览（缩略图 + 点击放大）
- 请假状态跟踪（登记 / 已销假）
- 批量销假、批量删除
- 分页浏览

### 综合评价
- 学生综合素质评价（自动生成 + 手动修改）
- 教师评分与等级评定（A/B/C/D）
- 评价表一键导出 Excel
- 依据成绩平均分 + 积分总和自动计算

### 积分管理
- 学生积分录入（正积分 / 负积分）
- 积分事由记录
- 批量删除、分页浏览

### 家校沟通
- 家校沟通记录（电话、微信、面谈等方式标记）
- 沟通内容与反馈追踪
- 批量删除、分页浏览

### 资源管理
- 教学资源上传与分类管理
- 资源文件下载
- 按名称模糊搜索

### 试卷管理
- 试卷信息录入（标题、类型、题目内容）
- 试卷内容预览
- 按标题搜索

### 背书情况
- 背书任务登记（关联学生，支持多选批量录入）
- 背书状态跟踪（待背 / 已背）
- 按状态、姓名、篇目筛选

### 座位表管理
- 可配置列数（3-10 列）
- 随机排座、按学号顺序排列
- 点击两个座位即可交换
- 座位布局持久化保存

### 系统功能
- **登录认证**：JWT Token 认证，默认账号 admin / admin123，支持修改密码
- **年级管理**：显示当前年级，一键年级升级（一年级→六年级），入学年份自动递增
- **教师信息**：点击右上角教师名称即可修改
- **表单校验**：所有录入表单均有字段校验规则
- **数据备份**：SQLite 单文件，便于备份恢复

## 技术栈

### 后端
- **Node.js** + **Express 5** - Web 框架
- **SQLite** - 轻量级数据库
- **jsonwebtoken** - JWT 认证
- **multer** - 文件上传
- **xlsx** - Excel 导入导出

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **Element Plus** - UI 组件库
- **ECharts** - 数据可视化图表
- **Vite** - 下一代前端构建工具
- **Vue Router** - 路由管理（含登录守卫）
- **Axios** - HTTP 客户端（含请求/响应拦截器）

### 部署
- **Docker** - 容器化部署
- **Alpine Linux** - 轻量级容器基础镜像
- **Docker Compose** - 容器编排

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 下载最新发布包
wget https://github.com/kyhx1984/teacher-works/releases/latest/download/teacher-ops-latest.tar.gz

# 2. 解压
tar -xzf teacher-ops-latest.tar.gz
cd teacher-ops

# 3. 一键部署（自动安装 Docker、构建镜像、启动容器）
./deploy.sh

# 4. 访问系统
# 浏览器打开: http://服务器IP:3000
# 默认账号: admin / admin123
```

**升级流程：**
```bash
# 解压新版本（覆盖旧代码）
tar -xzf teacher-ops-*.tar.gz

# 重启容器（无需重新构建镜像）
docker compose restart
```

**免本地构建：从 GHCR 拉取预构建镜像**

仓库已通过 GitHub Actions 自动构建多架构镜像（`linux/amd64` + `linux/arm64`）并推送到 GHCR，可跳过本地 `docker build` 直接拉取：

```bash
# 1. 拉取镜像（公开镜像，无需登录；按服务器 CPU 架构自动匹配）
docker pull ghcr.io/kyhx1984/teacher-works:latest

# 2. 让 compose 使用拉取的镜像：编辑 docker-compose.yml，
#    将 services.teacher-ops 下的 build 段（context/dockerfile 两行）替换为：
#      image: ghcr.io/kyhx1984/teacher-works:latest
#    其余卷挂载（代码 / 依赖 / 数据 / 日志）与环境变量全部保持不变

# 3. 启动
docker compose up -d
```

> **镜像形态说明**：该镜像是「运行环境镜像」（node:22-alpine + 编译工具链 + entrypoint.sh），
> 业务代码仍通过 bind mount 挂载、后端依赖仍在首次启动时安装到命名卷，因此**升级流程与本地构建完全一致**：
> 解压新代码 → `docker compose restart`。
>
> **可用标签**：`latest`（master 最新）、`master`、`v<版本号>`（发布标签）、`sha-<完整提交号>`（可固定版本便于回滚）。

### 方式二：源码部署

```bash
# 1. 克隆仓库
git clone https://github.com/kyhx1984/teacher-works.git
cd teacher-works

# 2. 安装后端依赖
cd backend
npm install

# 3. 安装前端依赖并构建
cd ../frontend
npm install
npm run build

# 4. 启动服务
cd ..
./start.sh

# 5. 访问系统
# 浏览器打开: http://localhost:3000
# 默认账号: admin / admin123
```

**macOS（Apple Silicon）注意**：sqlite3 等原生模块与 Node 的 CPU 架构必须一致。若本机装有多个 Node（如通过 nvm 装过 x86_64 版本），`npm install` 和启动请使用同一架构的 node，否则会报 `incompatible architecture` 错误。遇到该错误时删除 `node_modules` 后用 `arch -arm64` 前缀重装即可。

### 方式三：Windows 部署（Win10 1803+ / Win11）

**获取方式 A（推荐）**：下载发布包 `teacher-ops-*.zip`，用资源管理器双击解压，进入 `teacher-ops` 目录后按下面步骤操作。

**获取方式 B**：克隆源码后直接进入项目目录操作（首次会自动构建前端）。

```bat
:: 1. 解压或克隆源码后，进入项目目录，双击运行（或在资源管理器中双击）：
install.bat    :: 全自动安装：检测/自动安装 Node.js -> 安装后端依赖 -> 构建前端

:: 2. 一键启动（首次运行会自动检测并安装环境）
start.bat      :: 启动后自动打开浏览器，服务在后台运行

:: 3. 访问系统
:: 浏览器打开: http://localhost:3000
:: 默认账号: admin / admin123

:: 其他命令
start.bat status    :: 查看运行状态
start.bat restart   :: 重启服务
stop.bat            :: 一键停止服务
```

**说明：**
- `install.bat` 的 Node.js 自动安装顺序：已安装检测 → winget 静默安装 → 下载 MSI 静默安装（自动弹 UAC 提权）；全部失败时给出手动安装指引
- 脚本可重复执行（幂等），已安装的部分会自动跳过
- 服务端口默认 3000，如需修改请编辑 `start.bat` 顶部的 `PORT` 变量
- 日志位于 `logs\` 目录，进程 PID 记录在 `run\backend.pid`

### 开发模式

```bash
# 启动后端服务（端口 3000）
cd backend
npm run dev

# 启动前端开发服务器（端口 5173）
cd frontend
npm run dev
```

## 项目结构

```
teacher-works/
├── backend/                   # 后端服务
│   ├── routes/               # API 路由
│   │   ├── auth.js           # 认证接口（登录/验证/改密）
│   │   ├── teacher.js        # 教师相关接口
│   │   ├── advisor.js        # 班主任相关接口
│   │   └── stats.js          # 统计接口
│   ├── middleware/
│   │   └── auth.js           # JWT 认证中间件
│   ├── db.js                 # 数据库初始化
│   ├── server.js             # 服务入口
│   └── package.json          # 后端依赖
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── views/            # 页面组件
│   │   │   ├── login/        # 登录页
│   │   │   ├── dashboard/    # 数据看板
│   │   │   ├── teacher/      # 教师工作页面
│   │   │   └── advisor/      # 班主任工作页面
│   │   ├── api/              # API 接口封装
│   │   ├── router/           # 路由配置（含登录守卫）
│   │   └── layout/           # 布局组件
│   ├── dist/                 # 构建产物
│   └── package.json          # 前端依赖
├── docs/                      # 文档
├── build.sh                   # 构建打包脚本
├── start.sh                   # 启动脚本（mac/Linux）
├── stop.sh                    # 停止脚本（mac/Linux）
├── deploy.sh                  # Docker 部署脚本
├── install.bat                # Windows 环境安装脚本
├── start.bat                  # Windows 启动脚本
├── stop.bat                   # Windows 停止脚本
├── Dockerfile                 # Docker 镜像配置
├── docker-compose.yml         # Docker Compose 配置
└── entrypoint.sh              # 容器入口脚本
```

## API 文档

### 基础信息
- **基础路径**: `/api/v1`
- **数据格式**: JSON
- **认证方式**: JWT Token（Bearer Token）
- **默认账号**: admin / admin123

### 认证接口
- `POST /api/v1/auth/login` - 登录（返回 JWT Token）
- `GET /api/v1/auth/check` - 验证 Token 是否有效
- `PUT /api/v1/auth/password` - 修改密码

### 学生管理
- `GET /api/v1/students` - 获取学生列表
- `GET /api/v1/students/export` - 导出学生花名册 Excel
- `POST /api/v1/students` - 添加学生
- `POST /api/v1/students/import` - Excel 批量导入学生
- `PUT /api/v1/students/:id` - 更新学生信息
- `DELETE /api/v1/students/:id` - 删除学生（级联删除关联数据）
- `DELETE /api/v1/students/batch` - 批量删除学生

### 成绩管理
- `GET /api/v1/scores` - 获取成绩列表
- `GET /api/v1/scores/export` - 导出成绩单 Excel
- `POST /api/v1/scores` - 录入单条成绩
- `POST /api/v1/scores/import` - Excel 批量导入成绩
- `PUT /api/v1/scores/:id` - 更新成绩
- `DELETE /api/v1/scores/:id` - 删除成绩
- `DELETE /api/v1/scores/batch` - 批量删除成绩

### 考勤管理
- `GET /api/v1/leaves` - 获取请假记录
- `POST /api/v1/leaves` - 登记请假（支持上传请假条图片）
- `PUT /api/v1/leaves/batch-status` - 批量销假
- `DELETE /api/v1/leaves/:id` - 删除请假记录
- `DELETE /api/v1/leaves/batch` - 批量删除请假记录

### 综合评价
- `GET /api/v1/evaluations` - 获取评价列表
- `GET /api/v1/evaluations/export` - 导出评价表 Excel
- `POST /api/v1/evaluations/generate` - 一键生成评价
- `PUT /api/v1/evaluations/:id` - 更新评价

### 积分管理
- `GET /api/v1/points` - 获取积分列表
- `POST /api/v1/points` - 录入积分
- `DELETE /api/v1/points/:id` - 删除积分
- `DELETE /api/v1/points/batch` - 批量删除积分

### 家校沟通
- `GET /api/v1/communications` - 获取沟通记录
- `POST /api/v1/communications` - 新增沟通记录
- `DELETE /api/v1/communications/:id` - 删除沟通记录
- `DELETE /api/v1/communications/batch` - 批量删除沟通记录

### 背书管理
- `GET /api/v1/recitations` - 获取背书记录
- `POST /api/v1/recitations` - 登记背书
- `PUT /api/v1/recitations/:id` - 更新背书状态
- `DELETE /api/v1/recitations/:id` - 删除背书记录

### 座位表
- `GET /api/v1/seats` - 获取座位表
- `PUT /api/v1/seats` - 保存座位布局

### 系统设置
- `GET /api/v1/settings` - 获取系统设置
- `PUT /api/v1/settings/:key` - 更新设置项
- `POST /api/v1/settings/upgrade-grade` - 年级升级

### 资源管理
- `GET /api/v1/resources` - 获取资源列表
- `POST /api/v1/resources` - 上传资源
- `DELETE /api/v1/resources/:id` - 删除资源
- `GET/POST/DELETE /api/v1/resource-categories` - 资源功能类别管理

### 试卷管理
- `GET /api/v1/exams` - 获取试卷列表
- `POST /api/v1/exams` - 新增试卷（同班内标题唯一）
- `PUT /api/v1/exams/:id` - 更新试卷
- `DELETE /api/v1/exams/:id` - 删除试卷

### 考试记录
- `GET /api/v1/exam-records` - 获取考试记录（支持 exam_id 筛选）
- `POST /api/v1/exam-records` - 生成/补齐学生考试记录
- `PUT/DELETE /api/v1/exam-records/:id` - 更新/删除单条记录
- `POST /api/v1/exam-records/import` - Excel 导入成绩
- `GET /api/v1/exam-records/template` - 导出成绩模板/成绩数据 Excel

### 背书任务（两级结构）
- `GET/POST/PUT/DELETE /api/v1/recitation-tasks` - 背书任务管理
- `GET /api/v1/recitation-tasks/:id/export` - 导出全班完成情况 Excel

### 作业任务（两级结构）
- `GET/POST/PUT/DELETE /api/v1/homework-tasks` - 作业任务管理
- `GET /api/v1/homework-tasks/:id/export` - 导出全班完成情况 Excel

### 课程表
- `GET /api/v1/schedule` - 获取课程表
- `POST /api/v1/schedule` - 保存课程表项

### 班级管理（多班级）
- `GET/POST /api/v1/classes` - 班级列表/新建班级
- `PUT /api/v1/classes/:id` - 重命名班级
- `DELETE /api/v1/classes/:id` - 删除班级（需名称二次确认）

更多接口细节请参考 `backend/routes/` 目录下的路由文件。

## 数据备份

### 数据库位置
- **SQLite 数据库**: `backend/database.sqlite`（多班级时：主库 + 每班一个 `class-N.sqlite`，均在 backend/ 目录）
- **上传文件**: `backend/uploads/`
- **Docker 持久化**: 数据库在 `data/` 目录；上传文件因代码挂载在 `./backend`，实际持久化于宿主机 `backend/uploads/`（备份时需一并包含）

### 备份方法
```bash
# 备份数据库
cp backend/database.sqlite backend/database.sqlite.backup

# 备份上传文件
tar -czf uploads-backup.tar.gz backend/uploads/
```

### 恢复数据
```bash
# 恢复数据库
cp backend/database.sqlite.backup backend/database.sqlite

# 恢复上传文件
tar -xzf uploads-backup.tar.gz
```

## 常见问题

### 1. 端口被占用
修改 `backend/server.js` 中的 `PORT` 变量，或设置环境变量：
```bash
export PORT=3001
./start.sh
```

### 2. Docker 部署失败
检查 Docker 和 Docker Compose 是否已安装：
```bash
docker --version
docker compose version
```

### 3. 忘记登录密码
删除数据库中的密码设置，恢复默认密码 admin123：
```bash
sqlite3 backend/database.sqlite "UPDATE settings SET value='admin123' WHERE key='auth_password'"
```

### 4. 前端构建失败
确保 Node.js 版本 >= 18：
```bash
node --version
```

### 5. 数据库初始化失败
删除数据库文件重新初始化：
```bash
rm backend/database.sqlite
./start.sh
```

## 开发计划

- [x] ~~用户认证与权限管理~~
- [x] ~~数据导出（Excel）~~
- [x] ~~数据可视化图表~~
- [x] ~~批量导入导出~~
- [x] ~~批量操作~~
- [x] ~~列表分页~~
- [x] ~~年级递增机制~~
- [ ] 消息通知功能
- [ ] 移动端适配
- [ ] 操作日志记录
- [x] 多班级管理（每班独立数据库物理隔离，顶栏一键切换）

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

MIT License

## 联系方式

- **作者**: kyhx1984
- **GitHub**: [@kyhx1984](https://github.com/kyhx1984)
- **问题反馈**: [Issues](https://github.com/kyhx1984/teacher-works/issues)

---

**注意**: 本项目仅供学习交流使用，生产环境使用请做好数据备份和安全防护。
