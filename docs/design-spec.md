# 教师兼班主任工作台 - 详细设计文档

## 1. 架构设计
项目采用前后端分离架构，方便一键编译部署。
- **前端 (Frontend)**: Vue 3 + Vite + Element Plus + Vue Router + Axios
- **后端 (Backend)**: Node.js + Express + SQLite3
- **部署 (Deployment)**: 静态资源(Nginx) + 后端接口(PM2/Node)
- **数据持久化**: 使用轻量级的 SQLite，数据存储在 `backend/database.sqlite` 中，无需额外部署数据库服务。

## 2. 数据库设计 (SQLite)
共设计 9 张核心业务表。

### 2.1 资源表 (resources)
- `id` (INTEGER PK)
- `title` (TEXT): 资源名称
- `file_path` (TEXT): 存储路径
- `type` (TEXT): 文件类型
- `upload_time` (DATETIME)

### 2.2 试卷表 (exams)
- `id` (INTEGER PK)
- `title` (TEXT): 试卷标题
- `type` (TEXT): 类型(单元检测/专项等)
- `content` (TEXT): JSON 格式存储题目
- `created_at` (DATETIME)

### 2.3 背书表 (recitations)
- `id` (INTEGER PK)
- `student_name` (TEXT)
- `subject` (TEXT)
- `article` (TEXT): 篇目名称
- `status` (INTEGER): 0-未背, 1-已背

### 2.4 学生档案表 (students)
- `id` (INTEGER PK)
- `name` (TEXT)
- `gender` (TEXT)
- `birth` (TEXT)
- `parent_name` (TEXT)
- `phone` (TEXT)
- `family_info` (TEXT)
- `address` (TEXT)
- `is_special` (INTEGER): 0-否, 1-是
- `special_type` (TEXT): 特殊情况(单亲/孤儿等)

### 2.5 成绩表 (scores)
- `id` (INTEGER PK)
- `student_id` (INTEGER FK)
- `subject` (TEXT)
- `score` (REAL)
- `exam_name` (TEXT)

### 2.6 积分表 (points)
- `id` (INTEGER PK)
- `student_id` (INTEGER FK)
- `reason` (TEXT)
- `points` (INTEGER)
- `created_at` (DATETIME)

### 2.7 请假表 (leaves)
- `id` (INTEGER PK)
- `student_id` (INTEGER FK)
- `start_date` (TEXT)
- `end_date` (TEXT)
- `reason` (TEXT)
- `status` (TEXT): 登记/已销假

### 2.8 评价表 (evaluations)
- `id` (INTEGER PK)
- `student_id` (INTEGER FK)
- `teacher_score` (REAL)
- `final_grade` (TEXT): A/B/C
- `comment` (TEXT): 自动生成的评语

### 2.9 家校沟通表 (communications)
- `id` (INTEGER PK)
- `student_id` (INTEGER FK)
- `date` (TEXT)
- `method` (TEXT)
- `content` (TEXT)
- `feedback` (TEXT)

## 3. API 接口规范
统一前缀: `/api/v1`
所有接口返回标准 JSON: `{ "code": 200, "message": "success", "data": {} }`

### 教师工作
- `GET /resources`: 获取资源列表
- `POST /resources`: 上传资源 (multipart/form-data)
- `DELETE /resources/:id`: 删除资源
- `GET /exams`: 试卷列表
- `POST /exams`: 新增试卷
- `GET /recitations`: 背书表列表
- `POST /recitations`: 登记背书

### 班主任工作
- `GET /students`: 学生列表
- `POST /students/import`: Excel一键导入学生
- `GET /scores`: 成绩列表与进退分析
- `POST /scores/import`: Excel导入成绩
- `GET /points`: 积分列表
- `POST /points`: 录入积分
- `GET /seats`: 获取座位表 (根据学生表自动生成)
- `GET /leaves`: 请假列表
- `POST /leaves`: 登记/销假
- `POST /evaluations/generate`: 一键生成评价
- `GET /communications`: 沟通记录
- `POST /communications`: 新增沟通

## 4. 前端 UI/UX 规范
- **色彩**: 底色浅米白 (#F7F7F5)，主色调浅蓝 (#409EFF)，选中态浅橙色 (#FFB84D)。
- **布局**: 左侧菜单栏 (竖向呈现核心功能，分"教师工作"和"班主任工作")，右侧主体展示。
- **圆角**: 所有卡片使用大圆角 `border-radius: 12px`。
- **数据看板**: 首页顶部呈现关键指标 (资源总数、试卷数量、请假情况、沟通次数)。

## 5. 打包与部署
编写 `build.sh`：
1. 运行 `cd frontend && npm run build`
2. 确保 `backend/` 提供服务
3. 提供 Nginx 配置样例文件，将 `/` 指向 `frontend/dist`，`/api` 反向代理到 Node.js 监听端口(如 3000)。
