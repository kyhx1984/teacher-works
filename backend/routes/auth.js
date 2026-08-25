const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
// 登录认证属教师身份信息，固定读写主库（不随班级切换）
const { getMainDb } = require('../db');
const { SECRET_KEY, authMiddleware } = require('../middleware/auth');

// POST /auth/login - 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await getMainDb();
    const settings = {};
    const rows = await db.all('SELECT key, value FROM settings WHERE key IN (?, ?)', ['auth_username', 'auth_password']);
    rows.forEach(r => settings[r.key] = r.value);

    if (username !== (settings.auth_username || 'admin') || password !== (settings.auth_password || 'admin123')) {
      return res.status(401).json({ code: 401, message: '用户名或密码错误', data: null });
    }

    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '7d' });
    res.json({ code: 200, message: '登录成功', data: { token, username } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message, data: null });
  }
});

// GET /auth/check - 验证 token 是否有效
router.get('/check', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ code: 401, message: '未登录', data: null });
    const decoded = jwt.verify(token, SECRET_KEY);
    res.json({ code: 200, message: 'ok', data: { username: decoded.username } });
  } catch (err) {
    res.json({ code: 401, message: '登录已过期', data: null });
  }
});

// PUT /auth/password - 修改密码（需要认证）
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const db = await getMainDb();
    const row = await db.get('SELECT value FROM settings WHERE key = ?', ['auth_password']);
    if (oldPassword !== (row?.value || 'admin123')) {
      return res.status(400).json({ code: 400, message: '原密码错误', data: null });
    }
    await db.run('UPDATE settings SET value = ? WHERE key = ?', [newPassword, 'auth_password']);
    res.json({ code: 200, message: '密码修改成功', data: null });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message, data: null });
  }
});

module.exports = router;
