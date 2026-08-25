# 多班级管理 - 详细设计文档

> 日期: 2026-08-25
> 状态: 已确认（方案二：每班一个数据库文件，物理隔离）
> 前置文档: windows-deploy-design.md（无关，仅归档顺序）

## 1. 目标与范围

一位老师担任多个班级的班主任，需要在不同班级之间切换管理，**两个班级的业务数据完全隔离、互不耦合**。

**本期范围内**：
- 班级的创建 / 重命名 / 删除 / 切换
- 顶栏班级切换器 + 班级管理弹窗
- 每班独立的：学生、成绩、积分、请假、评价、沟通、座位、背书、作业、课程表、临时任务、年级设置、数据看板统计
- 老用户数据自动迁移为「默认班级」，零感知升级

**本期范围外（已确认接受）**：
- 跨班聚合对比视图（数据物理隔离，无法直接聚合）
- 跨班资源共享/共用试卷（如需共享，后续加一次性「复制到其他班」功能，不建立耦合）

## 2. 核心决策：每班一个 SQLite 文件

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据隔离方式 | 每班一个 .sqlite 文件 | 物理隔离，不可能串班；约 85 个业务接口查询代码零改动 |
| 班级上下文传递 | 请求头 `X-Class-Id` | 前端 request.js 一处注入；后端中间件一处解析 |
| 后端上下文实现 | `node:async_hooks` 的 `AsyncLocalStorage` | Node 标准 API，异步链路自动透传，业务代码无感知 |
| 连接管理 | 按文件路径缓存连接，进程生命周期内复用 | sqlite 连接打开成本高；单用户场景无并发压力 |
| 主库职责 | 登录认证、教师信息、班级注册表 | 身份与业务分离；auth 路由不经过班级中间件 |
| 兼容策略 | 无 X-Class-Id 或 id 无效时回退默认班级 | 宁可回退不崩溃；老版本脚本/curl 调用不受影响 |

## 3. 数据结构

### 3.1 主库 `backend/database.sqlite`（改动最小化）

新增 `classes` 注册表：

```sql
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,           -- 班级名称，如「一(1)班」
  db_file TEXT NOT NULL UNIQUE, -- 班级库文件名，如 class-1.sqlite
  is_default INTEGER DEFAULT 0, -- 默认班级（老数据迁移而来，不可删除）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

主库继续持有：settings 中的 `auth_username` / `auth_password` / `teacher_name` / `teacher_avatar`（教师身份，全局共享）。

**注意**：`grade_year` / `grade_level` 迁移到各班级库的 settings 表（原逻辑就是每库独立的 settings，天然支持）。

### 3.2 班级库 `backend/data/class-<id>.sqlite`

结构 = 现有 `initDb()` 建的全部业务表 + 每班独立 settings。
库文件统一放在 `backend/data/` 目录（与 Docker 的 `DB_PATH` 指向目录一致时自动归位；非 Docker 环境即 backend/data/）。

### 3.3 老用户迁移（一次性，幂等）

initDb 时检测：
1. 若 `classes` 表为空 → 把现有主库（含全部业务数据）注册为「默认班级」，`db_file='default'`（**复用主库文件本身**，不搬数据、零风险）
2. `default` 班级的库文件就是主库路径 → getDb 返回主库连接

> 复用主库文件而非拷贝，是关键降险点：迁移动作只是插一行注册记录，任何旧数据都不动。

### 3.4 新建班级

1. INSERT classes 记录得到 id
2. 创建 `backend/data/class-<id>.sqlite` 并执行完整 initDb 建表
3. 写入该班初始 settings（teacher_name 全局默认「陈老师」、auth 从主库同步——班级库内 auth 不使用，但保持表结构一致以防误引用）

### 3.5 删除班级

1. 仅允许删除非默认班级；需请求体携带 `confirm_name` 且与班级名完全一致（防误删）
2. 关闭并从连接缓存移除该库连接
3. DELETE classes 记录 + 删除 .sqlite 文件（文件删除失败仅告警不回滚，注册表已删即逻辑删除成功）

## 4. 后端设计

### 4.1 db.js 改造（核心）

```
主库连接: mainDb（进程级单例，现有逻辑不变）
班级连接缓存: Map<dbFile, connection>（含 'default' → 主库）
请求上下文: AsyncLocalStorage 实例，存 { classId, dbFile }

getDb():
  1. 从 AsyncLocalStorage 取当前请求的 dbFile
  2. 无上下文（如启动时 initDb）或 dbFile='default' → 返回主库
  3. 缓存命中 → 返回；未命中 → open(班级库路径) 并缓存
initDb(): 仍初始化主库（含 classes 表 + 老数据迁移）；
           班级库的建表抽取为 initClassDb(db) 供 classes 路由复用
initClassDb(db): 现 initDb 的全部建表/默认 settings 逻辑（不含 classes 表）
```

**兼容性**：所有业务路由 `require('./db').getDb()` 的调用方式完全不变。

### 4.2 班级中间件（新增，挂 server.js）

位置：`/api/v1/auth` 路由**之后**、业务路由**之前**。

```
1. 读请求头 X-Class-Id（数字）
2. 无头 / id 不存在 → 设置默认班级上下文（回退，不报错）
3. 查主库 classes 表得到 dbFile
4. als.run({ classId, dbFile }, next)
```

健康检查 `/api/v1/health` 不经过该中间件（在 auth 路由同级）。

### 4.3 routes/classes.js（新增，约 6 个接口，全部走 authMiddleware）

| 接口 | 说明 |
|---|---|
| GET /classes | 列表（含每班学生数，供切换器展示） |
| POST /classes | 创建（name 必填、唯一校验；重名返回 400） |
| PUT /classes/:id | 重命名 |
| DELETE /classes/:id | 删除（默认班拒绝；需 confirm_name 匹配） |
| GET /classes/current | 当前请求上下文的班级信息（前端校验用） |

中间件对该路由同样生效，但 classes 路由内部一律显式使用主库连接（getMainDb()），避免自我依赖。

## 5. 前端设计

### 5.1 班级上下文（store 简化为 localStorage + 事件）

- `localStorage.currentClassId` 存当前班级
- 切换班级时：更新 localStorage → `window.location.reload()`（整页刷新，最稳）
- request.js 拦截器：所有请求注入 `X-Class-Id: <currentClassId>`（无值则不注入，后端回退默认班）

### 5.2 顶栏班级切换器（layout/index.vue）

- 位置：年级标签左侧
- el-select（紧凑尺寸）+ 班级列表（label 显示「名称 · N人」）
- 仅 1 个班级时显示为只读标签样式（与年级标签一致的视觉，不出现下拉箭头）
- 「＋ 管理」入口 → 班级管理弹窗

### 5.3 班级管理弹窗

- 班级列表：名称（可编辑）、学生数、默认班标记、创建时间
- 新建：名称 + 确认；重命名：行内编辑；删除：输入班级名二次确认（默认班无删除按钮）
- 删除当前所在班级 → 删除后自动切回默认班

### 5.4 登录后恢复

login 成功 → 拉取班级列表 → localStorage 的 currentClassId 若仍存在则沿用，否则设为默认班 id。

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 上下文缺失（异常请求/脚本） | 回退默认班级，不报错不崩溃 |
| 班级库文件损坏 | 单班损坏不影响其他班；备份粒度=单文件，恢复简单 |
| 并发写（同班多请求） | sqlite WAL 模式下单机并发安全；本产品单教师场景压力极小 |
| 删除班级时连接占用 | 先从连接缓存移除再删文件；文件删失败不影响逻辑删除 |
| 双标签页开两个班 | 请求头按页传递，互不干扰（比全局服务端状态安全） |
| uploads 目录共用 | 文件名带时间戳+随机数，冲突概率极低；首期不分目录，降低改动面 |

## 7. 改动文件清单

| 文件 | 类型 | 改动量 |
|---|---|---|
| backend/db.js | 修改 | ~120 行（上下文 + 连接缓存 + 迁移 + initClassDb 抽取） |
| backend/routes/classes.js | 新增 | ~180 行 |
| backend/server.js | 修改 | ~10 行（中间件 + 路由挂载） |
| frontend/src/api/request.js | 修改 | ~5 行 |
| frontend/src/api/index.js | 修改 | ~20 行（classes 接口） |
| frontend/src/layout/index.vue | 修改 | ~250 行（切换器 + 管理弹窗） |
| README.md | 修改 | 功能特性补充 |

**不改动**：teacher.js / advisor.js / stats.js 的任何查询、其余全部前端页面。

## 8. 验收标准

1. 老库升级：首次启动自动出现「默认班级」，原有数据完整可见
2. 新建班级 B → B 班学生为空；A 班录入学生 → 切到 B 班看不到，切回 A 班仍在
3. A/B 班各自设置年级、升级年级互不影响
4. 数据看板统计随班级切换正确变化
5. 删除班级需输入名称确认；默认班不可删
6. 不带 X-Class-Id 的请求（如健康检查、旧脚本）行为与从前一致
