const jwt = require('jsonwebtoken');

// JWT 签名密钥
const SECRET_KEY = 'teacher-works-secret-2024';

// 验证 token 中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ code: 401, message: '未登录', data: null });
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: '登录已过期', data: null });
  }
};

module.exports = { authMiddleware, SECRET_KEY };
