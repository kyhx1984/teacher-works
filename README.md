# 教师兼班主任工作台

一站式教师工作管理系统，帮助教师高效管理学生信息、成绩、考勤、评价等日常工作。

## 功能特性

### 学生管理
- 学生基本信息管理（姓名、性别、出生日期、家长联系方式等）
- 特殊学生标记与分类管理
- 家庭信息记录

### 成绩管理
- 学生成绩录入与查询
- 按科目、考试名称统计分析
- 成绩趋势追踪

### 考勤管理
- 学生请假登记与审批
- 请假记录查询与统计
- 请假状态跟踪（登记/批准/销假）

### 综合评价
- 学生综合素质评价
- 教师评分与等级评定
- 评语记录与管理

### 沟通记录
- 家校沟通记录
- 沟通方式标记（电话、微信、面谈等）
- 沟通反馈追踪

### 资源管理
- 教学资源上传与分类
- 资源文件管理（文档、图片、视频等）
- 资源下载与分享

### 班级管理
- 班级座位表管理
- 座位可视化布局
- 座位调整记录

### 教师工作
- 考试安排管理
- 背诵任务跟踪
- 教学资源管理

### 系统设置
- 教师信息配置
- 系统参数设置
- 数据备份与恢复

## 技术栈

### 后端
- **Node.js** + **Express** - Web 框架
- **SQLite** - 轻量级数据库
- **better-sqlite3** - 高性能 SQLite 驱动

### 前端
- **Vue 3** - 渐进式 JavaScript 框架
- **Element Plus** - UI 组件库
- **Vite** - 下一代前端构建工具
- **Vue Router** - 路由管理
- **Axios** - HTTP 客户端

### 部署
- **Docker** - 容器化部署
- **Alpine Linux** - 轻量级容器基础镜像
- **Nginx** - 反向代理（可选）

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 1. 下载最新发布包
wget https://github.com/kyhx1984/teacher-works/releases/latest/download/teacher-ops-latest.tar.gz

# 2. 解压
tar -xzf teacher-ops-latest.tar.gz
cd teacher-ops

# 3. 一键部署
./deploy.sh

# 4. 访问系统
# 浏览器打开: http://服务器IP:3000
```

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
```

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
├── backend/              # 后端服务
│   ├── routes/          # API 路由
│   │   ├── teacher.js   # 教师相关接口
│   │   ├── advisor.js   # 班主任相关接口
│   │   └── stats.js     # 统计接口
│   ├── db.js            # 数据库初始化
│   ├── server.js        # 服务入口
│   └── package.json     # 后端依赖
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── views/      # 页面组件
│   │   ├── api/        # API 接口
│   │   ├── router/     # 路由配置
│   │   └── layout/     # 布局组件
│   ├── dist/           # 构建产物
│   └── package.json    # 前端依赖
├── deploy/              # 部署配置
│   └── nginx.conf      # Nginx 配置示例
├── docs/                # 文档
│   └── design-spec.md  # 设计文档
├── build.sh             # 构建脚本
├── start.sh             # 启动脚本
├── stop.sh              # 停止脚本
├── deploy.sh            # Docker 部署脚本
├── Dockerfile           # Docker 镜像配置
└── docker-compose.yml   # Docker Compose 配置
```

## API 文档

### 基础信息
- **基础路径**: `/api/v1`
- **数据格式**: JSON
- **认证方式**: 暂无（后续可扩展）

### 主要接口

#### 学生管理
- `GET /api/v1/students` - 获取学生列表
- `POST /api/v1/students` - 添加学生
- `PUT /api/v1/students/:id` - 更新学生信息
- `DELETE /api/v1/students/:id` - 删除学生

#### 成绩管理
- `GET /api/v1/scores` - 获取成绩列表
- `POST /api/v1/scores` - 录入成绩
- `PUT /api/v1/scores/:id` - 更新成绩
- `DELETE /api/v1/scores/:id` - 删除成绩

#### 考勤管理
- `GET /api/v1/leaves` - 获取请假记录
- `POST /api/v1/leaves` - 添加请假记录
- `PUT /api/v1/leaves/:id` - 更新请假状态

#### 综合评价
- `GET /api/v1/evaluations` - 获取评价列表
- `POST /api/v1/evaluations` - 添加评价
- `PUT /api/v1/evaluations/:id` - 更新评价

更多接口请参考 `backend/routes/` 目录下的路由文件。

## 数据备份

### 数据库位置
- **SQLite 数据库**: `backend/database.sqlite`
- **上传文件**: `backend/uploads/`

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
docker-compose --version
```

### 3. 前端构建失败
确保 Node.js 版本 >= 16：
```bash
node --version
```

### 4. 数据库初始化失败
删除数据库文件重新初始化：
```bash
rm backend/database.sqlite
./start.sh
```

## 开发计划

- [ ] 用户认证与权限管理
- [ ] 数据导出（Excel、PDF）
- [ ] 消息通知功能
- [ ] 移动端适配
- [ ] 多语言支持
- [ ] 数据可视化图表
- [ ] 批量导入导出
- [ ] 操作日志记录

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

## 截图预览

（待添加）

---

**注意**: 本项目仅供学习交流使用，生产环境使用请做好数据备份和安全防护。
