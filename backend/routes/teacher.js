const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Standard response formatter
// 正确映射业务状态码到 HTTP 状态码
const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  const httpStatus = code >= 200 && code < 600 ? code : 500;
  res.status(httpStatus).json({ code, message, data });
};

// ================= RESOURCES =================

// GET /resources - 获取资源列表
router.get('/resources', async (req, res) => {
  try {
    const db = await getDb();
    const resources = await db.all('SELECT * FROM resources ORDER BY upload_time DESC');
    sendResponse(res, resources);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /resources - 上传资源
router.post('/resources', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return sendResponse(res, null, 'No file uploaded', 400);
    }
    const { title, type } = req.body;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO resources (title, file_path, type) VALUES (?, ?, ?)',
      [title || req.file.originalname, req.file.filename, type || 'unknown']
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /resources/:id - 删除资源
router.delete('/resources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const resource = await db.get('SELECT * FROM resources WHERE id = ?', [id]);
    
    if (resource && resource.file_path) {
      const filePath = path.join(__dirname, '..', 'uploads', resource.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    
    await db.run('DELETE FROM resources WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= EXAMS =================

// GET /exams - 试卷列表
router.get('/exams', async (req, res) => {
  try {
    const db = await getDb();
    const exams = await db.all('SELECT * FROM exams ORDER BY created_at DESC');
    // Parse JSON content back for the frontend
    exams.forEach(exam => {
      if (exam.content) {
        try { exam.content = JSON.parse(exam.content); } catch (e) {}
      }
    });
    sendResponse(res, exams);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /exams - 新增试卷
router.post('/exams', async (req, res) => {
  try {
    const { title, type, content } = req.body;
    const db = await getDb();
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    const result = await db.run(
      'INSERT INTO exams (title, type, content) VALUES (?, ?, ?)',
      [title, type, contentStr]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /exams/:id - 删除试卷
router.delete('/exams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM exams WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= RECITATIONS =================

// GET /recitations - 背书表列表（LEFT JOIN students 表，返回 student_id, student_name）
// 使用 COALESCE(s.name, r.student_name)：优先取关联学生的姓名，无关联时回退到表中存储的 student_name，保证向后兼容
router.get('/recitations', async (req, res) => {
  try {
    const db = await getDb();
    const recitations = await db.all(`
      SELECT r.*, COALESCE(s.name, r.student_name) as student_name
      FROM recitations r
      LEFT JOIN students s ON r.student_id = s.id
      ORDER BY r.id DESC
    `);
    sendResponse(res, recitations);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /recitations - 登记背书
// 优先使用 student_id（若有则同时查出 student_name 存入），否则使用 student_name
router.post('/recitations', async (req, res) => {
  try {
    const { student_id, student_name, subject, article, status } = req.body;
    const db = await getDb();

    let finalStudentId = student_id || null;
    let finalStudentName = student_name || '';

    // 若提供了 student_id，则查出对应的 student_name 一并存入，便于显示
    if (finalStudentId) {
      const student = await db.get('SELECT name FROM students WHERE id = ?', [finalStudentId]);
      if (student) {
        finalStudentName = student.name;
      }
    }

    const result = await db.run(
      'INSERT INTO recitations (student_id, student_name, subject, article, status) VALUES (?, ?, ?, ?, ?)',
      [finalStudentId, finalStudentName, subject, article, status || 0]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /recitations/:id - 更新背书状态 (标记已背/撤销)
router.put('/recitations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM recitations WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '记录不存在', 404);
    await db.run('UPDATE recitations SET status = ? WHERE id = ?', [status === 1 ? 1 : 0, id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /recitations/:id - 删除背书记录
router.delete('/recitations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM recitations WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= SETTINGS =================

// GET /settings - 获取系统设置
router.get('/settings', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT key, value FROM settings');
    const settings = {};
    rows.forEach(row => { settings[row.key] = row.value; });
    sendResponse(res, settings);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /settings/upgrade-grade - 年级升级
// 读取当前年级与入学年份，将年级向后推一级（六年级封顶），年份 +1
router.post('/settings/upgrade-grade', async (req, res) => {
  try {
    const db = await getDb();
    // 读取当前年级与入学年份
    const gradeLevel = await db.get('SELECT value FROM settings WHERE key = ?', ['grade_level']);
    const gradeYear = await db.get('SELECT value FROM settings WHERE key = ?', ['grade_year']);

    // 年级顺序映射
    const gradeOrder = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级'];
    const currentIndex = gradeOrder.indexOf(gradeLevel?.value || '一年级');
    const nextIndex = Math.min(currentIndex + 1, gradeOrder.length - 1);
    const nextGrade = gradeOrder[nextIndex];
    const nextYear = String(Number(gradeYear?.value || '2025') + 1);

    // 更新年级与入学年份
    const existingLevel = await db.get('SELECT key FROM settings WHERE key = ?', ['grade_level']);
    if (existingLevel) {
      await db.run('UPDATE settings SET value = ? WHERE key = ?', [nextGrade, 'grade_level']);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['grade_level', nextGrade]);
    }
    const existingYear = await db.get('SELECT key FROM settings WHERE key = ?', ['grade_year']);
    if (existingYear) {
      await db.run('UPDATE settings SET value = ? WHERE key = ?', [nextYear, 'grade_year']);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['grade_year', nextYear]);
    }

    sendResponse(res, { grade_level: nextGrade, grade_year: nextYear }, '年级升级成功');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /settings/:key - 更新设置项
router.put('/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
    if (existing) {
      await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
    } else {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
    sendResponse(res, { key, value });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

module.exports = router;
