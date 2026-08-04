const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { initDb } = require('./db');

const teacherRoutes = require('./routes/teacher');
const advisorRoutes = require('./routes/advisor');
const statsRoutes = require('./routes/stats');

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
app.use(API_PREFIX, teacherRoutes);
app.use(API_PREFIX, advisorRoutes);
app.use(API_PREFIX, statsRoutes);

// Health check
app.get(API_PREFIX + '/health', (req, res) => {
  res.json({ code: 200, message: 'Server is running normally' });
});

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
