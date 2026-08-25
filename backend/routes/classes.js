const express = require('express');
const router = express.Router();
const fs = require('fs');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const {
  getMainDb,
  initClassDb,
  closeClassDb,
  classDbPath
} = require('../db');

const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  const httpStatus = code >= 200 && code < 600 ? code : 500;
  res.status(httpStatus).json({ code, message, data });
};

// 每班学生数需要查各班库的 students 表，逐班统计（班级数量少，性能无压力）
async function countStudents(dbFile) {
  // 默认班级直接复用主库
  if (dbFile === 'default') {
    const mainDb = await getMainDb();
    const row = await mainDb.get('SELECT COUNT(*) as c FROM students');
    return row ? row.c : 0;
  }
  const conn = await open({
    filename: classDbPath(dbFile),
    driver: sqlite3.Database
  });
  try {
    const row = await conn.get('SELECT COUNT(*) as c FROM students');
    return row ? row.c : 0;
  } finally {
    await conn.close();
  }
}

// GET /classes - 班级列表（含每班学生数）
router.get('/', async (req, res) => {
  try {
    const db = await getMainDb();
    const rows = await db.all('SELECT id, name, db_file, is_default, created_at FROM classes ORDER BY is_default DESC, id ASC');
    const result = [];
    for (const row of rows) {
      result.push({
        id: row.id,
        name: row.name,
        is_default: row.is_default === 1,
        created_at: row.created_at,
        student_count: await countStudents(row.db_file)
      });
    }
    sendResponse(res, result);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /classes - 创建班级
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return sendResponse(res, null, '班级名称不能为空', 400);
    }
    const trimmed = name.trim();

    const db = await getMainDb();
    // 名称唯一校验
    const dup = await db.get('SELECT id FROM classes WHERE name = ?', [trimmed]);
    if (dup) {
      return sendResponse(res, null, '班级名称已存在', 400);
    }

    // 先插入注册记录拿到 id，再以 class-<id>.sqlite 命名班级库
    const result = await db.run('INSERT INTO classes (name, db_file) VALUES (?, ?)', [trimmed, 'pending']);
    const classId = result.lastID;
    const dbFile = `class-${classId}.sqlite`;

    // 创建班级库文件并初始化全部业务表；失败时回滚注册记录，避免残留脏数据
    try {
      const conn = await open({
        filename: classDbPath(dbFile),
        driver: sqlite3.Database
      });
      try {
        await initClassDb(conn);
      } finally {
        await conn.close();
      }
      await db.run('UPDATE classes SET db_file = ? WHERE id = ?', [dbFile, classId]);
    } catch (e) {
      // 回滚：删除注册记录与可能残留的半成品库文件
      await db.run('DELETE FROM classes WHERE id = ?', [classId]);
      try {
        if (fs.existsSync(classDbPath(dbFile))) fs.unlinkSync(classDbPath(dbFile));
      } catch (cleanupErr) { /* 清理失败不影响回滚结果 */ }
      return sendResponse(res, null, `班级创建失败: ${e.message}`, 500);
    }

    sendResponse(res, { id: classId, name: trimmed, db_file: dbFile }, '班级创建成功');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /classes/:id - 重命名班级
router.put('/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return sendResponse(res, null, '班级名称不能为空', 400);
    }
    const trimmed = name.trim();
    const db = await getMainDb();

    const target = await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
    if (!target) {
      return sendResponse(res, null, '班级不存在', 404);
    }

    const dup = await db.get('SELECT id FROM classes WHERE name = ? AND id != ?', [trimmed, target.id]);
    if (dup) {
      return sendResponse(res, null, '班级名称已存在', 400);
    }

    await db.run('UPDATE classes SET name = ? WHERE id = ?', [trimmed, target.id]);
    sendResponse(res, { id: target.id, name: trimmed }, '班级重命名成功');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /classes/:id - 删除班级（默认班级不可删；需 confirm_name 二次确认）
router.delete('/:id', async (req, res) => {
  try {
    const { confirm_name } = req.body || {};
    const db = await getMainDb();

    const target = await db.get('SELECT * FROM classes WHERE id = ?', [req.params.id]);
    if (!target) {
      return sendResponse(res, null, '班级不存在', 404);
    }
    if (target.is_default === 1) {
      return sendResponse(res, null, '默认班级不可删除', 400);
    }
    // 防误删：请求体携带的班级名必须与目标班级完全一致
    if (confirm_name !== target.name) {
      return sendResponse(res, null, '确认名称与班级名称不一致，已取消删除', 400);
    }

    // 先关闭连接缓存中的该班连接，再删除库文件
    await closeClassDb(target.db_file);
    await db.run('DELETE FROM classes WHERE id = ?', [target.id]);
    try {
      if (fs.existsSync(classDbPath(target.db_file))) {
        fs.unlinkSync(classDbPath(target.db_file));
      }
    } catch (e) {
      // 文件删除失败仅告警：注册表已删即逻辑删除成功
      console.warn(`[classes] 班级库文件删除失败: ${target.db_file}`, e.message);
    }

    sendResponse(res, null, '班级已删除');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /classes/current - 当前请求上下文的班级信息（前端校验用）
router.get('/current', async (req, res) => {
  try {
    const db = await getMainDb();
    const classId = parseInt(req.headers['x-class-id'], 10);
    if (!classId || Number.isNaN(classId)) {
      const def = await db.get("SELECT id, name FROM classes WHERE is_default = 1");
      return sendResponse(res, def || null);
    }
    const row = await db.get('SELECT id, name FROM classes WHERE id = ?', [classId]);
    // id 无效时回退默认班级
    if (row) {
      sendResponse(res, row);
    } else {
      const def = await db.get("SELECT id, name FROM classes WHERE is_default = 1");
      sendResponse(res, def || null);
    }
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

module.exports = router;
