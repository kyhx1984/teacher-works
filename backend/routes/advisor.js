const express = require('express');
const router = express.Router();
const multer = require('multer');
const xlsx = require('xlsx');
const { getDb } = require('../db');

const upload = multer({ storage: multer.memoryStorage() });

// Standard response formatter
const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  res.status(code === 200 ? 200 : 500).json({ code, message, data });
};

// ================= STUDENTS =================

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
      await db.run(
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
      imported++;
    }
    
    sendResponse(res, { imported });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /students - 新增学生
router.post('/students', async (req, res) => {
  try {
    const { name, gender, birth, parent_name, phone, family_info, address, is_special, special_type } = req.body;
    if (!name) return sendResponse(res, null, '学生姓名不能为空', 400);
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO students (name, gender, birth, parent_name, phone, family_info, address, is_special, special_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, gender || '', birth || '', parent_name || '', phone || '', family_info || '', address || '',
       is_special ? 1 : 0, special_type || '']
    );
    sendResponse(res, { id: result.lastID });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /students/:id - 更新学生
router.put('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, gender, birth, parent_name, phone, family_info, address, is_special, special_type } = req.body;
    const db = await getDb();
    const existing = await db.get('SELECT id FROM students WHERE id = ?', [id]);
    if (!existing) return sendResponse(res, null, '学生不存在', 404);
    await db.run(
      `UPDATE students SET name=?, gender=?, birth=?, parent_name=?, phone=?, family_info=?, address=?, is_special=?, special_type=? WHERE id=?`,
      [name, gender || '', birth || '', parent_name || '', phone || '', family_info || '', address || '',
       is_special ? 1 : 0, special_type || '', id]
    );
    sendResponse(res, { id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /students/:id - 删除学生 (级联删除关联数据)
router.delete('/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
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
    
    for (const row of data) {
      if (!row.student_id || !row.subject || row.score === undefined) continue;
      await db.run(
        'INSERT INTO scores (student_id, subject, score, exam_name) VALUES (?, ?, ?, ?)',
        [row.student_id, row.subject, row.score, row.exam_name || '期中考试']
      );
      imported++;
    }
    
    sendResponse(res, { imported });
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

// GET /seats - 获取座位表
router.get('/seats', async (req, res) => {
  try {
    const db = await getDb();
    const students = await db.all('SELECT id, name FROM students ORDER BY id ASC');
    // Simple random or sequential seating logic
    // For now, return sequential pairs
    const seats = [];
    let row = 0;
    for (let i = 0; i < students.length; i += 2) {
      seats.push({
        row: row++,
        col1: students[i] || null,
        col2: students[i+1] || null
      });
    }
    sendResponse(res, seats);
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

// POST /leaves - 登记/销假
router.post('/leaves', async (req, res) => {
  try {
    const { student_id, start_date, end_date, reason, status, id } = req.body;
    const db = await getDb();
    
    if (id) {
      // Update existing leave (e.g., 销假)
      await db.run(
        'UPDATE leaves SET status = ? WHERE id = ?',
        [status || '已销假', id]
      );
      sendResponse(res, { id });
    } else {
      // Create new leave
      const result = await db.run(
        'INSERT INTO leaves (student_id, start_date, end_date, reason, status) VALUES (?, ?, ?, ?, ?)',
        [student_id, start_date, end_date, reason, status || '登记']
      );
      sendResponse(res, { id: result.lastID });
    }
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

// POST /communications - 新增沟通
router.post('/communications', async (req, res) => {
  try {
    const { student_id, date, method, content, feedback } = req.body;
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO communications (student_id, date, method, content, feedback) VALUES (?, ?, ?, ?, ?)',
      [student_id, date, method, content, feedback]
    );
    sendResponse(res, { id: result.lastID });
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
