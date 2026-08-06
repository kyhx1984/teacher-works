const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  const httpStatus = code >= 200 && code < 600 ? code : 500;
  res.status(httpStatus).json({ code, message, data });
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
    
    // 修复：使用 recitation_records 表统计未完成的背书任务
    const pendingRecitations = await db.get(`SELECT COUNT(*) as c FROM recitation_records WHERE status = 0`);
    const pointTotal = await db.get('SELECT COALESCE(SUM(points),0) as c FROM points');
    
    // 新增：作业统计
    const homeworkPending = await db.get(`SELECT COUNT(*) as c FROM homework_records WHERE status = 0`);
    const homeworkTotal = await db.get(`SELECT COUNT(*) as c FROM homework_records`);
    
    // 新增：背书任务统计
    const recitationTaskCount = await db.get(`SELECT COUNT(*) as c FROM recitation_tasks`);
    const recitationCompleted = await db.get(`SELECT COUNT(*) as c FROM recitation_records WHERE status = 1`);

    const stats = {
      resources: resourceCount ? resourceCount.c : 0,
      exams: examCount ? examCount.c : 0,
      students: studentCount ? studentCount.c : 0,
      leaves_today: leaveToday ? leaveToday.c : 0,
      active_leaves: activeLeaves ? activeLeaves.c : 0,
      communications: communicationCount ? communicationCount.c : 0,
      pending_recitations: pendingRecitations ? pendingRecitations.c : 0,
      total_points: pointTotal ? pointTotal.c : 0,
      // 新增字段
      homework_pending: homeworkPending ? homeworkPending.c : 0,
      homework_total: homeworkTotal ? homeworkTotal.c : 0,
      recitation_tasks: recitationTaskCount ? recitationTaskCount.c : 0,
      recitation_completed: recitationCompleted ? recitationCompleted.c : 0
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
    
    // 新增：最近作业活动
    const recentHomework = await db.all(
      `SELECT ht.*, st.name as student_name, hr.completed_at 
       FROM homework_records hr
       LEFT JOIN homework_tasks ht ON hr.task_id = ht.id
       LEFT JOIN students st ON hr.student_id = st.id
       WHERE hr.status = 1
       ORDER BY hr.completed_at DESC LIMIT 3`
    );
    recentHomework.forEach(h => {
      if (h.student_name && h.title) {
        activities.push({
          time: h.completed_at || h.created_at || '',
          type: 'homework',
          title: `${h.student_name} 完成了作业「${h.title}」`
        });
      }
    });
    
    // 新增：最近背书活动
    const recentRecitations = await db.all(
      `SELECT rt.title, st.name as student_name, rr.completed_at
       FROM recitation_records rr
       LEFT JOIN recitation_tasks rt ON rr.task_id = rt.id
       LEFT JOIN students st ON rr.student_id = st.id
       WHERE rr.status = 1
       ORDER BY rr.completed_at DESC LIMIT 3`
    );
    recentRecitations.forEach(r => {
      if (r.student_name && r.title) {
        activities.push({
          time: r.completed_at || '',
          type: 'recitation',
          title: `${r.student_name} 完成了背书任务「${r.title}」`
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
