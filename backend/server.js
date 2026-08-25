const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');

const teacherRoutes = require('./routes/teacher');
const advisorRoutes = require('./routes/advisor');
const statsRoutes = require('./routes/stats');
const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const { authMiddleware } = require('./middleware/auth');
const { getMainDb, runWithClass } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const API_PREFIX = '/api/v1';

// 不需要认证的路由（需在 authMiddleware 之前挂载）
// auth 路由：login / check 不需要认证，password 路由内部已加 authMiddleware
app.use(API_PREFIX + '/auth', authRoutes);
// 健康检查不需要认证
app.get(API_PREFIX + '/health', (req, res) => {
  res.json({ code: 200, message: 'Server is running normally' });
});

// 需要认证的路由（authMiddleware 认证 + classContextMiddleware 绑定班级上下文）
// ============================================================
// 多班级支持：班级上下文中间件 + 班级管理路由
// 中间件必须在 auth 路由之后、业务路由之前生效：
//   - auth 路由（登录/改密）读写主库，不绑定班级
//   - 业务路由通过 getDb() 自动拿到当前班级库
// 无 X-Class-Id 或 id 无效时回退默认班级，保证兼容不崩溃
// ============================================================
const classContextMiddleware = async (req, res, next) => {
  try {
    const db = await getMainDb();
    const classId = parseInt(req.headers['x-class-id'], 10);
    let row = null;
    if (classId && !Number.isNaN(classId)) {
      row = await db.get('SELECT id, db_file FROM classes WHERE id = ?', [classId]);
    }
    if (!row) {
      // 无请求头或 id 无效：回退默认班级
      row = await db.get("SELECT id, db_file FROM classes WHERE is_default = 1");
    }
    runWithClass(row ? { classId: row.id, dbFile: row.db_file } : null, next);
  } catch (err) {
    // 主库异常时仍放行请求（getDb 会回退主库），错误由业务路由抛出
    // 记录日志，避免静默降级到默认班级库而无任何痕迹
    console.error('[class-context] 班级上下文解析失败，回退默认班级:', err.message);
    next();
  }
};

app.use(API_PREFIX + '/classes', authMiddleware, classRoutes);
app.use(API_PREFIX, authMiddleware, classContextMiddleware, teacherRoutes);
app.use(API_PREFIX, authMiddleware, classContextMiddleware, advisorRoutes);
app.use(API_PREFIX, authMiddleware, classContextMiddleware, statsRoutes);

// 若前端已构建(dist 存在), 由后端直接托管前端页面,
// 无需 Nginx 也可通过 http://localhost:3000 直接访问整个系统。
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const hasFrontend = fs.existsSync(frontendDist) && fs.existsSync(path.join(frontendDist, 'index.html'));

if (hasFrontend) {
  // 静态资源(构建产物)
  app.use(express.static(frontendDist));
  // Vue Router history 模式兜底: 非 /api /uploads 的 GET 请求回退到 index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // 未构建前端时, 根路径给出提示
  app.get('/', (req, res) => {
    res.json({
      code: 200,
      message: '教师兼班主任工作台后端服务运行中',
      data: {
        api: API_PREFIX,
        health: API_PREFIX + '/health',
        uploads: '/uploads',
        note: '未检测到前端构建产物(frontend/dist), 请先执行 ./build.sh 构建前端, 或用 Nginx 托管前端'
      }
    });
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ code: 404, message: 'Not Found', data: null });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ code: 500, message: err.message || 'Internal Server Error', data: null });
});

// Initialize DB and start server
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`API prefix: ${API_PREFIX}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
