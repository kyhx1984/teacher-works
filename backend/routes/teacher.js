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

// GET /resources - 获取资源列表（支持 type 筛选和 keyword 模糊搜索）
router.get('/resources', async (req, res) => {
  try {
    const db = await getDb();
    const { type, keyword } = req.query;
    let sql = 'SELECT * FROM resources WHERE 1=1';
    const params = [];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    if (keyword) { sql += ' AND title LIKE ?'; params.push(`%${keyword}%`); }
    sql += ' ORDER BY upload_time DESC';
    const resources = await db.all(sql, params);
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

// GET /exams - 试卷列表（支持 type 筛选和 keyword 模糊搜索，LEFT JOIN resources）
router.get('/exams', async (req, res) => {
  try {
    const db = await getDb();
    const { type, keyword } = req.query;
    let sql = `
      SELECT e.*, r.title as resource_title, r.file_path as resource_path
      FROM exams e
      LEFT JOIN resources r ON e.resource_id = r.id
      WHERE 1=1
    `;
    const params = [];
    if (type) { sql += ' AND e.type = ?'; params.push(type); }
    if (keyword) { sql += ' AND e.title LIKE ?'; params.push(`%${keyword}%`); }
    sql += ' ORDER BY e.created_at DESC';
    const exams = await db.all(sql, params);
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

// POST /exams - 新增试卷（支持关联资源和备注）
router.post('/exams', async (req, res) => {
  try {
    const { title, type, content, resource_id, remark } = req.body;
    const db = await getDb();
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    const result = await db.run(
      'INSERT INTO exams (title, type, content, resource_id, remark) VALUES (?, ?, ?, ?, ?)',
      [title, type, contentStr, resource_id || null, remark || null]
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
    const { title, type, content, resource_id, remark } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM exams WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '试卷不存在', 404);
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    await db.run(
      'UPDATE exams SET title=?, type=?, content=?, resource_id=?, remark=? WHERE id=?',
      [title, type, contentStr, resource_id || null, remark || null, id]
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

// POST /recitations - 登记背书（支持批量创建和备注）
router.post('/recitations', async (req, res) => {
  try {
    const { student_ids, student_id, student_name, subject, article, status, remark } = req.body;
    const db = await getDb();

    // 支持批量创建：如果传入 student_ids 数组，则为每个学生创建一条记录
    if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
      let inserted = 0;
      for (const sid of student_ids) {
        const student = await db.get('SELECT name FROM students WHERE id = ?', [sid]);
        const finalStudentName = student ? student.name : '';
        await db.run(
          'INSERT INTO recitations (student_id, student_name, subject, article, status, remark) VALUES (?, ?, ?, ?, ?, ?)',
          [sid, finalStudentName, subject, article, status || 0, remark || null]
        );
        inserted++;
      }
      sendResponse(res, { inserted });
    } else {
      // 单条创建
      let finalStudentId = student_id || null;
      let finalStudentName = student_name || '';

      if (finalStudentId) {
        const student = await db.get('SELECT name FROM students WHERE id = ?', [finalStudentId]);
        if (student) {
          finalStudentName = student.name;
        }
      }

      const result = await db.run(
        'INSERT INTO recitations (student_id, student_name, subject, article, status, remark) VALUES (?, ?, ?, ?, ?, ?)',
        [finalStudentId, finalStudentName, subject, article, status || 0, remark || null]
      );
      sendResponse(res, { id: result.lastID });
    }
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /recitations/:id - 更新背书状态/备注
router.put('/recitations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM recitations WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '记录不存在', 404);
    if (status !== undefined) {
      await db.run('UPDATE recitations SET status = ?, remark = ? WHERE id = ?', [status === 1 ? 1 : 0, remark || null, id]);
    } else {
      await db.run('UPDATE recitations SET remark = ? WHERE id = ?', [remark || null, id]);
    }
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

// ================= RECITATION TASKS (分级结构) =================

// GET /recitation-tasks - 获取所有背书任务
router.get('/recitation-tasks', async (req, res) => {
  try {
    const db = await getDb();
    const tasks = await db.all(`
      SELECT t.*, 
        COUNT(r.id) as total_students,
        SUM(CASE WHEN r.status = 1 THEN 1 ELSE 0 END) as completed_students
      FROM recitation_tasks t
      LEFT JOIN recitation_records r ON t.id = r.task_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    sendResponse(res, tasks);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /recitation-tasks - 创建背书任务
router.post('/recitation-tasks', upload.single('image'), async (req, res) => {
  try {
    const { title, subject, content, remark } = req.body;
    const image_path = req.file ? req.file.filename : null;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO recitation_tasks (title, subject, content, image_path, remark) VALUES (?, ?, ?, ?, ?)',
      [title, subject, content, image_path, remark]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /recitation-tasks/:id - 更新背书任务
router.put('/recitation-tasks/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subject, content, remark } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT image_path FROM recitation_tasks WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '任务不存在', 404);
    
    let image_path = existing.image_path;
    if (req.file) {
      // 删除旧图片
      if (image_path) {
        const oldPath = path.join(__dirname, '..', 'uploads', image_path);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      image_path = req.file.filename;
    }
    
    await db.run(
      'UPDATE recitation_tasks SET title = ?, subject = ?, content = ?, image_path = ?, remark = ? WHERE id = ?',
      [title, subject, content, image_path, remark, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /recitation-tasks/:id - 删除背书任务（同时删除相关记录）
router.delete('/recitation-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const task = await db.get('SELECT image_path FROM recitation_tasks WHERE id = ?', [id]);
    if (task && task.image_path) {
      const imagePath = path.join(__dirname, '..', 'uploads', task.image_path);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    
    await db.run('DELETE FROM recitation_records WHERE task_id = ?', [id]);
    await db.run('DELETE FROM recitation_tasks WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /recitation-tasks/:id/records - 获取某个任务下的所有背书记录
router.get('/recitation-tasks/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const records = await db.all(`
      SELECT r.*, s.name as student_name
      FROM recitation_records r
      LEFT JOIN students s ON r.student_id = s.id
      WHERE r.task_id = ?
      ORDER BY s.name
    `, [id]);
    sendResponse(res, records);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /recitation-tasks/:id/records - 为某个任务批量创建背书记录
router.post('/recitation-tasks/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const { student_ids } = req.body;
    const db = await getDb();
    
    const task = await db.get('SELECT id FROM recitation_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    
    let inserted = 0;
    for (const student_id of student_ids) {
      const exists = await db.get(
        'SELECT id FROM recitation_records WHERE task_id = ? AND student_id = ?',
        [id, student_id]
      );
      if (!exists) {
        await db.run(
          'INSERT INTO recitation_records (task_id, student_id, status) VALUES (?, ?, 0)',
          [id, student_id]
        );
        inserted++;
      }
    }
    sendResponse(res, { inserted });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /recitation-records/:id - 更新背书记录状态
router.put('/recitation-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remark } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id FROM recitation_records WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '记录不存在', 404);
    
    const completed_at = status === 1 ? new Date().toISOString() : null;
    await db.run(
      'UPDATE recitation_records SET status = ?, remark = ?, completed_at = ? WHERE id = ?',
      [status === 1 ? 1 : 0, remark, completed_at, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /recitation-records/:id - 删除背书记录
router.delete('/recitation-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM recitation_records WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /recitation-tasks/:id/export - 导出背书任务完成情况Excel
router.get('/recitation-tasks/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const task = await db.get('SELECT * FROM recitation_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    
    const records = await db.all(`
      SELECT r.*, s.name as student_name, s.grade, s.class
      FROM recitation_records r
      LEFT JOIN students s ON r.student_id = s.id
      WHERE r.task_id = ?
      ORDER BY s.class, s.name
    `, [id]);
    
    const data = records.map(r => ({
      '班级': r.class || '',
      '姓名': r.student_name || '',
      '状态': r.status === 1 ? '已完成' : '未完成',
      '完成时间': r.completed_at ? new Date(r.completed_at).toLocaleString('zh-CN') : '',
      '备注': r.remark || ''
    }));
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 30 }
    ];
    
    xlsx.utils.book_append_sheet(wb, ws, '背书完成情况');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(task.title)}_背书完成情况.xlsx"`);
    res.send(buffer);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= HOMEWORK TASKS (作业管理分级结构) =================

// GET /homework-tasks - 获取所有作业任务
router.get('/homework-tasks', async (req, res) => {
  try {
    const db = await getDb();
    const tasks = await db.all(`
      SELECT t.*, 
        COUNT(r.id) as total_students,
        SUM(CASE WHEN r.status = 1 THEN 1 ELSE 0 END) as completed_students
      FROM homework_tasks t
      LEFT JOIN homework_records r ON t.id = r.task_id
      GROUP BY t.id
      ORDER BY t.homework_date DESC, t.created_at DESC
    `);
    sendResponse(res, tasks);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /homework-tasks - 创建作业任务
router.post('/homework-tasks', async (req, res) => {
  try {
    const { title, subject, content, homework_date, remark } = req.body;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO homework_tasks (title, subject, content, homework_date, remark) VALUES (?, ?, ?, ?, ?)',
      [title, subject, content, homework_date, remark]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /homework-tasks/:id - 更新作业任务
router.put('/homework-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, subject, content, homework_date, remark } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id FROM homework_tasks WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '任务不存在', 404);
    
    await db.run(
      'UPDATE homework_tasks SET title = ?, subject = ?, content = ?, homework_date = ?, remark = ? WHERE id = ?',
      [title, subject, content, homework_date, remark, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /homework-tasks/:id - 删除作业任务（同时删除相关记录）
router.delete('/homework-tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    await db.run('DELETE FROM homework_records WHERE task_id = ?', [id]);
    await db.run('DELETE FROM homework_tasks WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /homework-tasks/:id/records - 获取某个任务下的所有作业记录
router.get('/homework-tasks/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const records = await db.all(`
      SELECT r.*, s.name as student_name, s.grade, s.class
      FROM homework_records r
      LEFT JOIN students s ON r.student_id = s.id
      WHERE r.task_id = ?
      ORDER BY s.class, s.name
    `, [id]);
    sendResponse(res, records);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /homework-tasks/:id/records - 为某个任务批量创建作业记录
router.post('/homework-tasks/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const { student_ids } = req.body;
    const db = await getDb();
    
    const task = await db.get('SELECT id FROM homework_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    
    let inserted = 0;
    for (const student_id of student_ids) {
      const exists = await db.get(
        'SELECT id FROM homework_records WHERE task_id = ? AND student_id = ?',
        [id, student_id]
      );
      if (!exists) {
        await db.run(
          'INSERT INTO homework_records (task_id, student_id, status) VALUES (?, ?, 0)',
          [id, student_id]
        );
        inserted++;
      }
    }
    sendResponse(res, { inserted });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /homework-records/:id - 更新作业记录状态
router.put('/homework-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, score, remark } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id FROM homework_records WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '记录不存在', 404);
    
    const completed_at = status === 1 ? new Date().toISOString() : null;
    await db.run(
      'UPDATE homework_records SET status = ?, score = ?, remark = ?, completed_at = ? WHERE id = ?',
      [status === 1 ? 1 : 0, score, remark, completed_at, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /homework-records/:id - 删除作业记录
router.delete('/homework-records/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM homework_records WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /homework-tasks/:id/export - 导出作业任务完成情况Excel
router.get('/homework-tasks/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const task = await db.get('SELECT * FROM homework_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    
    const records = await db.all(`
      SELECT r.*, s.name as student_name, s.grade, s.class
      FROM homework_records r
      LEFT JOIN students s ON r.student_id = s.id
      WHERE r.task_id = ?
      ORDER BY s.class, s.name
    `, [id]);
    
    const data = records.map(r => ({
      '班级': r.class || '',
      '姓名': r.student_name || '',
      '状态': r.status === 1 ? '已完成' : '未完成',
      '成绩': r.score || '',
      '完成时间': r.completed_at ? new Date(r.completed_at).toLocaleString('zh-CN') : '',
      '备注': r.remark || ''
    }));
    
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data);
    
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 20 },
      { wch: 30 }
    ];
    
    xlsx.utils.book_append_sheet(wb, ws, '作业完成情况');
    
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(task.title)}_作业完成情况.xlsx"`);
    res.send(buffer);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= SCHEDULE (课程表) =================

// GET /schedule - 获取课程表
router.get('/schedule', async (req, res) => {
  try {
    const db = await getDb();
    const schedules = await db.all('SELECT * FROM schedule ORDER BY week_day, period');
    sendResponse(res, schedules);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /schedule - 创建或更新课程表项
router.post('/schedule', async (req, res) => {
  try {
    const { week_day, period, subject, teacher, room, color, remark } = req.body;
    const db = await getDb();
    
    // 检查是否已存在
    const existing = await db.get(
      'SELECT id FROM schedule WHERE week_day = ? AND period = ?',
      [week_day, period]
    );
    
    if (existing) {
      // 更新
      await db.run(
        'UPDATE schedule SET subject = ?, teacher = ?, room = ?, color = ?, remark = ? WHERE id = ?',
        [subject, teacher, room, color, remark, existing.id]
      );
      sendResponse(res, { id: existing.id, updated: true });
    } else {
      // 创建
      const result = await db.run(
        'INSERT INTO schedule (week_day, period, subject, teacher, room, color, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [week_day, period, subject, teacher, room, color, remark]
      );
      sendResponse(res, { id: result.lastID, created: true });
    }
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /schedule/:id - 删除课程表项
router.delete('/schedule/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM schedule WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= TASKS (临时工作区) =================

// GET /tasks - 获取所有任务
router.get('/tasks', async (req, res) => {
  try {
    const db = await getDb();
    const tasks = await db.all('SELECT * FROM tasks ORDER BY created_at DESC');
    sendResponse(res, tasks);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /tasks - 创建任务
router.post('/tasks', async (req, res) => {
  try {
    const { title, description, priority, due_date } = req.body;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO tasks (title, description, priority, due_date) VALUES (?, ?, ?, ?)',
      [title, description, priority || 'normal', due_date]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /tasks/:id - 更新任务
router.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, due_date } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '任务不存在', 404);
    
    await db.run(
      'UPDATE tasks SET title = ?, description = ?, priority = ?, status = ?, due_date = ? WHERE id = ?',
      [title, description, priority, status, due_date, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /tasks/:id/complete - 完成任务
router.put('/tasks/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    
    const existing = await db.get('SELECT id FROM tasks WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '任务不存在', 404);
    
    const completed_at = new Date().toISOString();
    await db.run(
      'UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?',
      ['completed', completed_at, id]
    );
    sendResponse(res, { id, completed_at });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /tasks/:id - 删除任务
router.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM tasks WHERE id = ?', [id]);
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
