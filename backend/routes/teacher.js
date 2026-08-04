const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
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

// GET /exams - 试卷列表（LEFT JOIN resources，返回关联资源信息）
router.get('/exams', async (req, res) => {
  try {
    const db = await getDb();
    const exams = await db.all(`
      SELECT e.*, r.title as resource_title, r.file_path as resource_path
      FROM exams e
      LEFT JOIN resources r ON e.resource_id = r.id
      ORDER BY e.created_at DESC
    `);
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

// POST /exams - 新增试卷（支持关联资源）
router.post('/exams', async (req, res) => {
  try {
    const { title, type, content, resource_id } = req.body;
    const db = await getDb();
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    const result = await db.run(
      'INSERT INTO exams (title, type, content, resource_id) VALUES (?, ?, ?, ?)',
      [title, type, contentStr, resource_id || null]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /exams/:id - 更新试卷
router.put('/exams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, type, content, resource_id } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM exams WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '试卷不存在', 404);
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    await db.run(
      'UPDATE exams SET title=?, type=?, content=?, resource_id=? WHERE id=?',
      [title, type, contentStr, resource_id || null, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /exams/:id - 删除试卷（级联删除 exam_records）
router.delete('/exams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    // 先删除关联的考试记录
    await db.run('DELETE FROM exam_records WHERE exam_id = ?', [id]);
    await db.run('DELETE FROM exams WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= EXAM RECORDS =================

// GET /exam-records - 获取考试记录（支持按 exam_id 筛选）
router.get('/exam-records', async (req, res) => {
  try {
    const { exam_id } = req.query;
    const db = await getDb();
    let sql = `
      SELECT er.*, s.name as student_name, e.title as exam_title
      FROM exam_records er
      LEFT JOIN students s ON er.student_id = s.id
      LEFT JOIN exams e ON er.exam_id = e.id
    `;
    const params = [];
    if (exam_id) {
      sql += ' WHERE er.exam_id = ?';
      params.push(exam_id);
    }
    sql += ' ORDER BY s.id ASC';
    const records = await db.all(sql, params);
    sendResponse(res, records);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /exam-records - 批量生成学生考试记录
router.post('/exam-records', async (req, res) => {
  try {
    const { exam_id } = req.body;
    if (!exam_id) return sendResponse(res, null, 'exam_id 不能为空', 400);
    
    const db = await getDb();
    // 检查考试是否存在
    const exam = await db.get('SELECT id FROM exams WHERE id = ?', [exam_id]);
    if (!exam) return sendResponse(res, null, '考试不存在', 404);
    
    // 获取所有学生
    const students = await db.all('SELECT id FROM students');
    
    // 检查是否已有记录
    const existing = await db.get('SELECT COUNT(*) as count FROM exam_records WHERE exam_id = ?', [exam_id]);
    if (existing.count > 0) {
      return sendResponse(res, null, '该考试已有学生记录，请先删除旧记录', 400);
    }
    
    // 批量插入
    let inserted = 0;
    for (const student of students) {
      await db.run(
        'INSERT INTO exam_records (exam_id, student_id) VALUES (?, ?)',
        [exam_id, student.id]
      );
      inserted++;
    }
    
    sendResponse(res, { inserted });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /exam-records/:id - 更新单条考试记录
router.put('/exam-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { score, comment, remark } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM exam_records WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '记录不存在', 404);
    
    await db.run(
      'UPDATE exam_records SET score=?, comment=?, remark=? WHERE id=?',
      [score !== undefined ? score : null, comment || null, remark || null, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /exam-records/:id - 删除单条考试记录
router.delete('/exam-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM exam_records WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /exam-records/template - 导出空模板（学生列表 + 成绩列空）
router.get('/exam-records/template', async (req, res) => {
  try {
    const { exam_id } = req.query;
    if (!exam_id) return sendResponse(res, null, 'exam_id 不能为空', 400);
    
    const db = await getDb();
    const exam = await db.get('SELECT title FROM exams WHERE id = ?', [exam_id]);
    if (!exam) return sendResponse(res, null, '考试不存在', 404);
    
    // 获取所有学生
    const students = await db.all('SELECT id, name FROM students ORDER BY id ASC');
    
    // 构建数据
    const data = students.map(s => ({
      '学号': s.id,
      '姓名': s.name,
      '成绩': '',
      '评语': '',
      '备注': ''
    }));
    
    // 创建工作簿
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 }, // 学号
      { wch: 15 }, // 姓名
      { wch: 10 }, // 成绩
      { wch: 30 }, // 评语
      { wch: 20 }  // 备注
    ];
    
    xlsx.utils.book_append_sheet(wb, ws, '成绩模板');
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exam.title)}_成绩模板.xlsx"`);
    
    // 写入响应
    xlsx.writeFile(wb, res);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /exam-records/export - 导出成绩数据
router.get('/exam-records/export', async (req, res) => {
  try {
    const { exam_id } = req.query;
    if (!exam_id) return sendResponse(res, null, 'exam_id 不能为空', 400);
    
    const db = await getDb();
    const exam = await db.get('SELECT title FROM exams WHERE id = ?', [exam_id]);
    if (!exam) return sendResponse(res, null, '考试不存在', 404);
    
    // 获取考试记录
    const records = await db.all(`
      SELECT er.score, er.comment, er.remark, s.id as student_id, s.name as student_name
      FROM exam_records er
      LEFT JOIN students s ON er.student_id = s.id
      WHERE er.exam_id = ?
      ORDER BY s.id ASC
    `, [exam_id]);
    
    // 构建数据
    const data = records.map(r => ({
      '学号': r.student_id,
      '姓名': r.student_name,
      '成绩': r.score,
      '评语': r.comment || '',
      '备注': r.remark || ''
    }));
    
    // 创建工作簿
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 }, // 学号
      { wch: 15 }, // 姓名
      { wch: 10 }, // 成绩
      { wch: 30 }, // 评语
      { wch: 20 }  // 备注
    ];
    
    xlsx.utils.book_append_sheet(wb, ws, '成绩数据');
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(exam.title)}_成绩数据.xlsx"`);
    
    // 写入响应
    xlsx.writeFile(wb, res);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /exam-records/import - 导入成绩数据
router.post('/exam-records/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendResponse(res, null, '未上传文件', 400);
    
    const { exam_id } = req.body;
    if (!exam_id) return sendResponse(res, null, 'exam_id 不能为空', 400);
    
    const db = await getDb();
    const exam = await db.get('SELECT id FROM exams WHERE id = ?', [exam_id]);
    if (!exam) return sendResponse(res, null, '考试不存在', 404);
    
    // 读取 Excel
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);
    
    let imported = 0;
    let updated = 0;
    
    for (const row of data) {
      const studentId = row['学号'];
      const score = row['成绩'];
      const comment = row['评语'] || '';
      const remark = row['备注'] || '';
      
      if (!studentId) continue;
      
      // 检查是否已有记录
      const existing = await db.get(
        'SELECT id FROM exam_records WHERE exam_id = ? AND student_id = ?',
        [exam_id, studentId]
      );
      
      if (existing) {
        // 更新
        await db.run(
          'UPDATE exam_records SET score=?, comment=?, remark=? WHERE id=?',
          [score || null, comment, remark, existing.id]
        );
        updated++;
      } else {
        // 插入
        await db.run(
          'INSERT INTO exam_records (exam_id, student_id, score, comment, remark) VALUES (?, ?, ?, ?, ?)',
          [exam_id, studentId, score || null, comment, remark]
        );
        imported++;
      }
    }
    
    // 删除临时文件
    fs.unlinkSync(req.file.path);
    
    sendResponse(res, { imported, updated });
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
