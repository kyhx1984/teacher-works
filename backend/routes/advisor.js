const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { getDb, getMainDb } = require('../db');

// 用于 Excel 导入的内存存储上传
const upload = multer({ storage: multer.memoryStorage() });

// 用于请假条图片上传（保存到 uploads/ 目录）
const leaveImageStorage = multer.diskStorage({
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
const leaveImageUpload = multer({ storage: leaveImageStorage });

// Standard response formatter
const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  const httpStatus = code >= 200 && code < 600 ? code : 500;
  res.status(httpStatus).json({ code, message, data });
};

// ================= STUDENTS =================

// 为已有考试记录的试卷补充该学生的考试记录（成绩为空），保证学生档案与试卷管理保持一致
async function fillMissingExamRecords(db, studentId) {
  const examRows = await db.all('SELECT DISTINCT exam_id FROM exam_records');
  for (const row of examRows) {
    await db.run(
      'INSERT INTO exam_records (exam_id, student_id) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM exam_records WHERE exam_id = ? AND student_id = ?)',
      [row.exam_id, studentId, row.exam_id, studentId]
    );
  }
}

// GET /students - 学生列表
router.get('/students', async (req, res) => {
  try {
    const db = await getDb();
    const students = await db.all('SELECT * FROM students ORDER BY id ASC');
    sendResponse(res, students);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /students/import - Excel一键导入学生
router.post('/students/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendResponse(res, null, 'No file uploaded', 400);
    
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    
    const db = await getDb();
    let imported = 0;
    
    for (const row of data) {
      if (!row.name) continue; // skip empty rows
      const result = await db.run(
        `INSERT INTO students (name, gender, birth, parent_name, phone, family_info, address, is_special, special_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.name || '',
          row.gender || '',
          row.birth || '',
          row.parent_name || '',
          row.phone || '',
          row.family_info || '',
          row.address || '',
          row.is_special ? 1 : 0,
          row.special_type || ''
        ]
      );
      // 同步：为已有考试记录的试卷补充该学生的考试记录
      await fillMissingExamRecords(db, result.lastID);
      imported++;
    }
    
    sendResponse(res, { imported });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /students - 新增学生（支持备注 remark 与头像 avatar）
router.post('/students', async (req, res) => {
  try {
    const { name, gender, birth, parent_name, phone, family_info, address, is_special, special_type, remark, avatar } = req.body;
    if (!name) return sendResponse(res, null, '学生姓名不能为空', 400);
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO students (name, gender, birth, parent_name, phone, family_info, address, is_special, special_type, remark, avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gender || '', birth || '', parent_name || '', phone || '', family_info || '', address || '',
       is_special ? 1 : 0, special_type || '', remark || null, avatar || null]
    );
    // 同步：为已有考试记录的试卷补充该学生的考试记录
    await fillMissingExamRecords(db, result.lastID);
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /students/:id - 更新学生（支持备注 remark 与头像 avatar）
router.put('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gender, birth, parent_name, phone, family_info, address, is_special, special_type, remark, avatar } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM students WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '学生不存在', 404);
    await db.run(
      `UPDATE students SET name=?, gender=?, birth=?, parent_name=?, phone=?, family_info=?, address=?, is_special=?, special_type=?, remark=?, avatar=? WHERE id=?`,
      [name, gender || '', birth || '', parent_name || '', phone || '', family_info || '', address || '',
       is_special ? 1 : 0, special_type || '', remark || null, avatar || null, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /students/:id/avatar - 上传学生头像（保存到 uploads/ 目录，更新 avatar 字段）
router.post('/students/:id/avatar', leaveImageUpload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return sendResponse(res, null, '未上传头像文件', 400);
    const db = await getDb();
    const existing = await db.get('SELECT id, avatar FROM students WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '学生不存在', 404);
    // 删除旧头像文件
    if (existing.avatar) {
      const oldPath = path.join(__dirname, '..', 'uploads', existing.avatar);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* 忽略删除失败 */ }
      }
    }
    await db.run('UPDATE students SET avatar = ? WHERE id = ?', [req.file.filename, id]);
    sendResponse(res, { avatar: req.file.filename });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /teacher/avatar - 上传教师头像（保存到 uploads/ 目录，更新 settings.teacher_avatar）
// 教师头像属教师身份，固定写主库（全局共享，不随班级切换）
router.post('/teacher/avatar', leaveImageUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return sendResponse(res, null, '未上传头像文件', 400);
    const db = await getMainDb();
    // 删除旧头像文件（卡通头像为 emoji: 前缀，跳过）
    const old = await db.get("SELECT value FROM settings WHERE key = 'teacher_avatar'");
    if (old && old.value && !old.value.startsWith('emoji:')) {
      const oldPath = path.join(__dirname, '..', 'uploads', old.value);
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* 忽略删除失败 */ }
      }
    }
    await setSetting(db, 'teacher_avatar', req.file.filename);
    sendResponse(res, { avatar: req.file.filename });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /students/batch - 批量删除学生（级联删除关联数据）
// 请求体：{ ids: [1, 2, 3] }
// 注意：必须放在 DELETE /students/:id 之前，否则 "batch" 会被 :id 参数匹配
router.delete('/students/batch', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    // 逐个删除，复用单条学生的级联删除逻辑
    for (const id of ids) {
      await db.run('DELETE FROM exam_records WHERE student_id = ?', [id]);
      await db.run('DELETE FROM scores WHERE student_id = ?', [id]);
      await db.run('DELETE FROM points WHERE student_id = ?', [id]);
      await db.run('DELETE FROM leaves WHERE student_id = ?', [id]);
      await db.run('DELETE FROM evaluations WHERE student_id = ?', [id]);
      await db.run('DELETE FROM communications WHERE student_id = ?', [id]);
      await db.run('DELETE FROM students WHERE id = ?', [id]);
    }
    sendResponse(res, { ids });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /students/:id - 删除学生 (级联删除关联数据)
router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    // 删除考试记录（试卷管理）与成绩分析中的成绩，保持数据一致
    await db.run('DELETE FROM exam_records WHERE student_id = ?', [id]);
    await db.run('DELETE FROM scores WHERE student_id = ?', [id]);
    await db.run('DELETE FROM points WHERE student_id = ?', [id]);
    await db.run('DELETE FROM leaves WHERE student_id = ?', [id]);
    await db.run('DELETE FROM evaluations WHERE student_id = ?', [id]);
    await db.run('DELETE FROM communications WHERE student_id = ?', [id]);
    await db.run('DELETE FROM students WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /students/export - 导出学生花名册为 Excel
// 注意：必须放在 GET /students/:id 之前，否则 "export" 会被 :id 参数匹配
router.get('/students/export', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM students ORDER BY id ASC');
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '学生花名册');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="students.xlsx"');
    res.send(buffer);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /students/:id - 学生详情
router.get('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const student = await db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!student) return sendResponse(res, null, '学生不存在', 404);
    sendResponse(res, student);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= SCORES =================

// 将成绩同步到试卷管理的考试记录（按考试名称匹配试卷，保留评语/备注/图片）
// score 为空时仅清空对应考试记录的成绩，不删除记录
async function syncExamRecord(db, studentId, examName, score) {
  if (!studentId || !examName) return;
  const exam = await db.get('SELECT id FROM exams WHERE title = ?', [examName]);
  if (!exam) return;
  const existing = await db.get('SELECT id FROM exam_records WHERE exam_id = ? AND student_id = ?', [exam.id, studentId]);
  if (score !== null && score !== undefined && score !== '') {
    if (existing) {
      await db.run('UPDATE exam_records SET score = ? WHERE id = ?', [score, existing.id]);
    } else {
      await db.run('INSERT INTO exam_records (exam_id, student_id, score) VALUES (?, ?, ?)', [exam.id, studentId, score]);
    }
  } else if (existing) {
    await db.run('UPDATE exam_records SET score = NULL WHERE id = ?', [existing.id]);
  }
}

// GET /scores - 成绩列表与进退分析
router.get('/scores', async (req, res) => {
  try {
    const db = await getDb();
    const scores = await db.all(`
      SELECT s.id, s.subject, s.score, s.exam_name, st.name as student_name
      FROM scores s
      LEFT JOIN students st ON s.student_id = st.id
      ORDER BY s.exam_name DESC, s.score DESC
    `);
    sendResponse(res, scores);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /scores/import - Excel导入成绩
router.post('/scores/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendResponse(res, null, 'No file uploaded', 400);

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const db = await getDb();
    let imported = 0;

    // 导入的成绩写入数据库，并同步到试卷管理的考试记录
    for (const row of data) {
      if (!row.student_id || !row.subject || row.score === undefined) continue;
      await db.run(
        'INSERT INTO scores (student_id, subject, score, exam_name) VALUES (?, ?, ?, ?)',
        [row.student_id, row.subject, row.score, row.exam_name || '期中考试']
      );
      await syncExamRecord(db, row.student_id, row.exam_name || '期中考试', row.score);
      imported++;
    }

    sendResponse(res, { imported });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /scores - 单条成绩录入（同步到试卷管理的考试记录）
router.post('/scores', async (req, res) => {
  try {
    const { student_id, subject, score, exam_name } = req.body;
    if (!student_id || !subject || score === undefined) {
      return sendResponse(res, null, 'student_id, subject, score 不能为空', 400);
    }
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO scores (student_id, subject, score, exam_name) VALUES (?, ?, ?, ?)',
      [student_id, subject, score, exam_name || '期中考试']
    );
    await syncExamRecord(db, student_id, exam_name || '期中考试', score);
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /scores/:id - 更新单条成绩（同步到试卷管理的考试记录）
router.put('/scores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { student_id, subject, score, exam_name } = req.body;
    const db = await getDb();
    const old = await db.get('SELECT student_id, exam_name FROM scores WHERE id = ?', [id]);
    if (!old) return sendResponse(res, null, '成绩记录不存在', 404);
    await db.run(
      'UPDATE scores SET student_id=?, subject=?, score=?, exam_name=? WHERE id=?',
      [student_id, subject, score, exam_name || '期中考试', id]
    );
    // 同步考试记录：先清除旧考试下的成绩，再写入新考试/新成绩（防止考试名称变更后残留）
    await syncExamRecord(db, old.student_id, old.exam_name, null);
    await syncExamRecord(db, student_id, exam_name || '期中考试', score);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /scores/batch - 批量删除成绩（同步删除试卷管理考试记录中对应成绩）
// 请求体：{ ids: [1, 2, 3] }
// 注意：必须放在 DELETE /scores/:id 之前，否则 "batch" 会被 :id 参数匹配
router.delete('/scores/batch', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    // 先取出待删记录（用于同步考试记录），再使用占位符列表批量删除
    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.all(`SELECT student_id, exam_name FROM scores WHERE id IN (${placeholders})`, ids);
    await db.run(`DELETE FROM scores WHERE id IN (${placeholders})`, ids);
    for (const row of rows) {
      await syncExamRecord(db, row.student_id, row.exam_name, null);
    }
    sendResponse(res, { ids });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /scores/:id - 删除单条成绩（同步删除试卷管理考试记录中对应成绩）
router.delete('/scores/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const row = await db.get('SELECT student_id, exam_name FROM scores WHERE id = ?', [id]);
    await db.run('DELETE FROM scores WHERE id = ?', [id]);
    if (row) {
      await syncExamRecord(db, row.student_id, row.exam_name, null);
    }
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /scores/export - 导出成绩为 Excel
router.get('/scores/export', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT s.id, st.name as student_name, s.subject, s.score, s.exam_name
      FROM scores s
      LEFT JOIN students st ON s.student_id = st.id
      ORDER BY s.exam_name DESC, s.score DESC
    `);
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '成绩');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="scores.xlsx"');
    res.send(buffer);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= POINTS =================

// GET /points - 积分列表
router.get('/points', async (req, res) => {
  try {
    const db = await getDb();
    const points = await db.all(`
      SELECT p.*, st.name as student_name
      FROM points p
      LEFT JOIN students st ON p.student_id = st.id
      ORDER BY p.created_at DESC
    `);
    sendResponse(res, points);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /points - 录入积分
router.post('/points', async (req, res) => {
  try {
    const { student_id, reason, points } = req.body;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO points (student_id, reason, points) VALUES (?, ?, ?)',
      [student_id, reason, points]
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /points/batch - 批量删除积分记录
// 请求体：{ ids: [1, 2, 3] }
// 注意：必须放在 DELETE /points/:id 之前，否则 "batch" 会被 :id 参数匹配
router.delete('/points/batch', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM points WHERE id IN (${placeholders})`, ids);
    sendResponse(res, { ids });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /points/:id - 删除积分记录
router.delete('/points/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM points WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= SEATS =================

// 读取 settings 表中某个 key 的值
const getSetting = async (db, key) => {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
};

// 写入 settings 表（存在则更新，不存在则插入）
const setSetting = async (db, key, value) => {
  const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
  } else {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
};

// GET /seats - 获取座位表
// 读取 settings 中的 seat_columns（默认 4）、seat_rows（默认行数）与 seat_layout（JSON 布局）
// 若有保存的布局则按布局返回，否则按学号顺序与列数自动排列
router.get('/seats', async (req, res) => {
  try {
    const db = await getDb();
    // 读取列数设置（默认 4）
    const colValue = await getSetting(db, 'seat_columns');
    let columns = colValue ? parseInt(colValue, 10) : 4;
    if (!columns || columns < 1) columns = 4;
    // 读取目标行数设置（默认 8）
    const rowValue = await getSetting(db, 'seat_rows');
    let targetRows = rowValue ? parseInt(rowValue, 10) : 8;
    if (!targetRows || targetRows < 1) targetRows = 8;
    // 读取已保存的座位布局
    const layoutValue = await getSetting(db, 'seat_layout');
    let savedLayout = null;
    if (layoutValue) {
      try { savedLayout = JSON.parse(layoutValue); } catch (e) { savedLayout = null; }
    }

    const students = await db.all('SELECT id, name, gender FROM students ORDER BY id ASC');

    // 将扁平布局（[{student_id,row,col}]）构建为二维 rows 网格
    // 确保至少展示 targetRows 行，即使部分行为空
    const buildRows = (entries) => {
      const layoutRows = entries.length
        ? Math.max(...entries.map((e) => e.row)) + 1
        : 0;
      // 取布局行数和目标行数中的较大值，确保空行也能展示
      const rowCount = Math.max(layoutRows, targetRows);
      const rows = [];
      for (let r = 0; r < rowCount; r++) {
        rows.push(new Array(columns).fill(null));
      }
      entries.forEach((e) => {
        if (e.row >= 0 && e.row < rows.length && e.col >= 0 && e.col < columns) {
          const stu = students.find((s) => s.id === e.student_id);
          rows[e.row][e.col] = stu ? { student_id: stu.id, name: stu.name, gender: stu.gender } : null;
        }
      });
      return rows;
    };

    let rows;
    if (savedLayout && Array.isArray(savedLayout) && savedLayout.length) {
      rows = buildRows(savedLayout);
    } else {
      // 没有保存布局时按学号顺序自动排列
      const autoLayout = students.map((s, idx) => ({
        student_id: s.id,
        row: Math.floor(idx / columns),
        col: idx % columns
      }));
      rows = buildRows(autoLayout);
    }

    sendResponse(res, { columns, rows, targetRows });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /seats - 保存座位表
// 接收 { columns, targetRows, layout }，layout 为 [{student_id,row,col}, ...]
// 保存到 settings 表的 seat_columns、seat_rows 与 seat_layout
router.put('/seats', async (req, res) => {
  try {
    const { columns, targetRows, layout } = req.body;
    const db = await getDb();
    let cols = parseInt(columns, 10);
    if (!cols || cols < 1) cols = 4;
    let rows = parseInt(targetRows, 10);
    if (!rows || rows < 1) rows = 8;
    await setSetting(db, 'seat_columns', String(cols));
    await setSetting(db, 'seat_rows', String(rows));
    await setSetting(db, 'seat_layout', JSON.stringify(Array.isArray(layout) ? layout : []));
    sendResponse(res, { columns: cols, targetRows: rows, saved: true });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= LEAVES =================

// GET /leaves - 请假列表
router.get('/leaves', async (req, res) => {
  try {
    const db = await getDb();
    const leaves = await db.all(`
      SELECT l.*, st.name as student_name
      FROM leaves l
      LEFT JOIN students st ON l.student_id = st.id
      ORDER BY l.id DESC
    `);
    sendResponse(res, leaves);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /leaves - 登记请假（multipart/form-data，支持上传请假条图片和备注）
router.post('/leaves', leaveImageUpload.single('image'), async (req, res) => {
  try {
    const { student_id, start_date, end_date, reason, remark } = req.body;
    const db = await getDb();
    const imagePath = req.file ? req.file.filename : null;
    const result = await db.run(
      'INSERT INTO leaves (student_id, start_date, end_date, reason, status, image_path, remark) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [student_id, start_date, end_date, reason, '登记', imagePath, remark || null]
    );
    sendResponse(res, { id: result.lastID, image_path: imagePath });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /leaves/batch-status - 批量销假
// 请求体：{ ids: [1, 2, 3], status: '已销假' }
// 注意：必须放在 DELETE /leaves/:id 之前；同时由于无 PUT /leaves/:id，
// 不存在路径冲突，但保留提示便于后续扩展
router.put('/leaves/batch-status', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const status = req.body?.status || '已销假';
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`UPDATE leaves SET status = ? WHERE id IN (${placeholders})`, [status, ...ids]);
    sendResponse(res, { ids, status });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /leaves/:id - 编辑请假记录（支持更新备注和上传补充材料）
router.put('/leaves/:id', leaveImageUpload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, reason, remark } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id, image_path FROM leaves WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '请假记录不存在', 404);
    
    // 构建更新SQL
    const updates = [];
    const params = [];
    
    if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
    if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }
    if (reason !== undefined) { updates.push('reason = ?'); params.push(reason); }
    if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
    
    // 如果上传了新图片，更新image_path
    if (req.file) {
      updates.push('image_path = ?');
      params.push(req.file.filename);
      
      // 删除旧图片文件
      if (existing.image_path) {
        const oldImagePath = path.join(__dirname, '..', 'uploads', existing.image_path);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }
    
    if (updates.length === 0) {
      return sendResponse(res, null, '没有需要更新的字段', 400);
    }
    
    params.push(id);
    await db.run(`UPDATE leaves SET ${updates.join(', ')} WHERE id = ?`, params);
    
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /leaves/batch - 批量删除请假记录
// 请求体：{ ids: [1, 2, 3] }
// 注意：必须放在 DELETE /leaves/:id 之前，否则 "batch" 会被 :id 参数匹配
router.delete('/leaves/batch', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM leaves WHERE id IN (${placeholders})`, ids);
    sendResponse(res, { ids });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /leaves/:id - 删除请假记录
router.delete('/leaves/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM leaves WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= EVALUATIONS =================

// GET /evaluations - 评价列表
router.get('/evaluations', async (req, res) => {
  try {
    const db = await getDb();
    const evaluations = await db.all(`
      SELECT e.*, st.name as student_name
      FROM evaluations e
      LEFT JOIN students st ON e.student_id = st.id
      ORDER BY e.student_id ASC
    `);
    sendResponse(res, evaluations);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /evaluations/generate - 一键生成评价
router.post('/evaluations/generate', async (req, res) => {
  try {
    const db = await getDb();
    const students = await db.all('SELECT id, name FROM students');
    
    let generated = 0;
    for (const student of students) {
      const existing = await db.get('SELECT id FROM evaluations WHERE student_id = ?', [student.id]);
      if (existing) continue;

      // 计算平均分与最高分
      const scoreRow = await db.get(
        'SELECT AVG(score) as avg, MAX(score) as max_score FROM scores WHERE student_id = ?',
        [student.id]
      );
      const avg = scoreRow && scoreRow.avg != null ? Math.round(scoreRow.avg * 10) / 10 : 0;
      const maxScore = scoreRow && scoreRow.max_score != null ? scoreRow.max_score : 0;
      // 积分
      const pointRow = await db.get(
        'SELECT COALESCE(SUM(points),0) as total FROM points WHERE student_id = ?',
        [student.id]
      );
      const totalPoints = pointRow ? pointRow.total : 0;

      let teacher_score, final_grade;
      if (avg > 0) {
        teacher_score = Math.max(60, Math.min(100, Math.round(avg)));
        if (teacher_score >= 90) final_grade = 'A';
        else if (teacher_score >= 80) final_grade = 'B';
        else if (teacher_score >= 70) final_grade = 'C';
        else final_grade = 'D';
      } else {
        teacher_score = 85;
        final_grade = 'B';
      }

      const template = teacher_score >= 90 ? '学习态度认真，成绩优异' :
        teacher_score >= 80 ? '表现良好，成绩稳定' :
        teacher_score >= 70 ? '有所进步，应再接再厉' : '仍需努力，建议加强辅导';
      let comment = `${student.name}同学本学期${template}`;
      if (totalPoints > 0) comment += `，累计获得积分 ${totalPoints} 分`;
      if (maxScore > 0) comment += `，单科最高 ${maxScore} 分`;

      await db.run(
        'INSERT INTO evaluations (student_id, teacher_score, final_grade, comment) VALUES (?, ?, ?, ?)',
        [student.id, teacher_score, final_grade, comment]
      );
      generated++;
    }
    sendResponse(res, { generated });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /evaluations/:id - 手动更新评价
router.put('/evaluations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { teacher_score, final_grade, comment } = req.body;
    const db = await getDb();
    await db.run(
      'UPDATE evaluations SET teacher_score=?, final_grade=?, comment=? WHERE id=?',
      [teacher_score, final_grade, comment, id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /evaluations/export - 导出评价表为 Excel
router.get('/evaluations/export', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT e.id, st.name as student_name, e.teacher_score, e.final_grade, e.comment
      FROM evaluations e
      LEFT JOIN students st ON e.student_id = st.id
      ORDER BY e.student_id ASC
    `);
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, '评价表');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="evaluations.xlsx"');
    res.send(buffer);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// ================= COMMUNICATIONS =================

// GET /communications - 沟通记录
router.get('/communications', async (req, res) => {
  try {
    const db = await getDb();
    const communications = await db.all(`
      SELECT c.*, st.name as student_name
      FROM communications c
      LEFT JOIN students st ON c.student_id = st.id
      ORDER BY c.date DESC
    `);
    sendResponse(res, communications);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /communications - 新增沟通（支持附件上传）
router.post('/communications', leaveImageUpload.array('attachments', 5), async (req, res) => {
  try {
    const { student_id, date, method, content, feedback } = req.body;
    const db = await getDb();
    
    // 处理附件
    let attachments = null;
    if (req.files && req.files.length > 0) {
      attachments = req.files.map(f => f.filename).join(',');
    }
    
    const result = await db.run(
      'INSERT INTO communications (student_id, date, method, content, feedback, attachments) VALUES (?, ?, ?, ?, ?, ?)',
      [student_id, date, method, content, feedback, attachments]
    );
    sendResponse(res, { id: result.lastID, attachments });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /communications/:id - 编辑沟通记录（支持更新基本信息和附件）
router.put('/communications/:id', leaveImageUpload.array('attachments', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const { student_id, date, method, content, feedback, replace_attachments } = req.body;
    const db = await getDb();
    
    const existing = await db.get('SELECT id, attachments FROM communications WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '沟通记录不存在', 404);
    
    // 构建更新字段
    const updates = [];
    const params = [];
    
    if (student_id !== undefined) { updates.push('student_id = ?'); params.push(student_id); }
    if (date !== undefined) { updates.push('date = ?'); params.push(date); }
    if (method !== undefined) { updates.push('method = ?'); params.push(method); }
    if (content !== undefined) { updates.push('content = ?'); params.push(content); }
    if (feedback !== undefined) { updates.push('feedback = ?'); params.push(feedback); }
    
    // 处理附件
    if (req.files && req.files.length > 0) {
      const newAttachments = req.files.map(f => f.filename).join(',');
      
      if (replace_attachments === 'true' || replace_attachments === true) {
        // 替换模式：删除旧附件，使用新附件
        if (existing.attachments) {
          const oldFiles = existing.attachments.split(',');
          oldFiles.forEach(file => {
            const filePath = path.join(__dirname, '..', 'uploads', file.trim());
            if (fs.existsSync(filePath)) {
              try { fs.unlinkSync(filePath); } catch (e) { /* 忽略删除失败 */ }
            }
          });
        }
        updates.push('attachments = ?');
        params.push(newAttachments);
      } else {
        // 追加模式：将新附件添加到现有附件列表
        const combinedAttachments = existing.attachments 
          ? existing.attachments + ',' + newAttachments 
          : newAttachments;
        updates.push('attachments = ?');
        params.push(combinedAttachments);
      }
    }
    
    if (updates.length === 0) {
      return sendResponse(res, null, '没有需要更新的字段', 400);
    }
    
    params.push(id);
    await db.run(`UPDATE communications SET ${updates.join(', ')} WHERE id = ?`, params);
    
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /communications/batch - 批量删除沟通记录
// 请求体：{ ids: [1, 2, 3] }
// 注意：必须放在 DELETE /communications/:id 之前，否则 "batch" 会被 :id 参数匹配
router.delete('/communications/batch', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return sendResponse(res, null, 'ids 不能为空', 400);
    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.run(`DELETE FROM communications WHERE id IN (${placeholders})`, ids);
    sendResponse(res, { ids });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /communications/:id - 删除沟通记录
router.delete('/communications/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await db.run('DELETE FROM communications WHERE id = ?', [id]);
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

module.exports = router;
