const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  res.status(code === 200 ? 200 : 500).json({ code, message, data });
};

// GET /stats - 数据看板统计
router.get('/stats', async (req, res) => {
  try {
    const db = await getDb();
    const resourceCount = await db.get('SELECT COUNT(*) as c FROM resources');
    const examCount = await db.get('SELECT COUNT(*) as c FROM exams');
    const studentCount = await db.get('SELECT COUNT(*) as c FROM students');
    const leaveToday = await db.get(
      `SELECT COUNT(*) as c FROM leaves WHERE status = '登记' AND date(start_date) <= date('now') AND date(end_date) >= date('now')`
    );
    const activeLeaves = await db.get(`SELECT COUNT(*) as c FROM leaves WHERE status = '登记'`);
    const communicationCount = await db.get('SELECT COUNT(*) as c FROM communications');
    const pendingRecitations = await db.get(`SELECT COUNT(*) as c FROM recitations WHERE status = 0`);
    const pointTotal = await db.get('SELECT COALESCE(SUM(points),0) as c FROM points');

    const stats = {
      resources: resourceCount ? resourceCount.c : 0,
      exams: examCount ? examCount.c : 0,
      students: studentCount ? studentCount.c : 0,
      leaves_today: leaveToday ? leaveToday.c : 0,
      active_leaves: activeLeaves ? activeLeaves.c : 0,
      communications: communicationCount ? communicationCount.c : 0,
      pending_recitations: pendingRecitations ? pendingRecitations.c : 0,
      total_points: pointTotal ? pointTotal.c : 0
    };

    // 最近动态
    const activities = [];
    const recentLeaves = await db.all(
      `SELECT l.*, st.name as student_name FROM leaves l LEFT JOIN students st ON l.student_id = st.id ORDER BY l.id DESC LIMIT 3`
    );
    recentLeaves.forEach(l => {
      if (l.student_name) {
        activities.push({
          time: l.start_date || '',
          type: 'leave',
          title: `${l.student_name} 同学的请假${l.status === '已销假' ? '已销假' : '正在登记'}`
        });
      }
    });
    const recentResources = await db.all(
      `SELECT * FROM resources ORDER BY upload_time DESC LIMIT 3`
    );
    recentResources.forEach(r => {
      activities.push({
        time: r.upload_time || '',
        type: 'resource',
        title: `上传了资源「${r.title}」`
      });
    });
    const recentComms = await db.all(
      `SELECT c.*, st.name as student_name FROM communications c LEFT JOIN students st ON c.student_id = st.id ORDER BY c.date DESC LIMIT 3`
    );
    recentComms.forEach(c => {
      if (c.student_name) {
        activities.push({
          time: c.date || '',
          type: 'communication',
          title: `与 ${c.student_name} 的家长进行了${c.method || '电话'}沟通`
        });
      }
    });

    activities.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    sendResponse(res, { stats, activities });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

module.exports = router;
