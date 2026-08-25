const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const { AsyncLocalStorage } = require('node:async_hooks');

// 支持通过环境变量配置数据库路径，Docker 部署时指向持久化数据目录
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');

// ============================================================
// 多班级支持：主库存身份（登录/教师信息/班级注册表），
// 每班一个数据库文件存业务数据（学生/成绩/请假等），物理隔离。
// ============================================================

// 班级库文件统一存放目录（与主库同目录，Docker 下随 DB_PATH 归位）
const classDbDir = path.dirname(dbPath);

// 请求级班级上下文：中间件调用 runWithClass 注入，异步链路自动透传
const classContext = new AsyncLocalStorage();

// 班级连接缓存：dbFile -> 连接（'default' 直接复用主库连接）
const classDbCache = new Map();

let dbInstance = null;

// 主库连接（显式获取，供班级注册表等身份类查询使用）
async function getMainDb() {
  if (dbInstance) {
    return dbInstance;
  }
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  return dbInstance;
}

// 获取当前请求上下文的班级库连接：
// 1. 无班级上下文（启动阶段/健康检查等）或默认班级 -> 主库
// 2. 有上下文 -> 对应班级库文件（按文件路径缓存连接）
async function getDb() {
  const ctx = classContext.getStore();
  if (!ctx || !ctx.dbFile || ctx.dbFile === 'default') {
    return getMainDb();
  }
  if (classDbCache.has(ctx.dbFile)) {
    return classDbCache.get(ctx.dbFile);
  }
  const conn = await open({
    filename: path.join(classDbDir, ctx.dbFile),
    driver: sqlite3.Database
  });
  classDbCache.set(ctx.dbFile, conn);
  return conn;
}

// 班级中间件调用：把当前请求绑定到指定班级库
function runWithClass(ctx, next) {
  classContext.run(ctx, next);
}

// 从连接缓存移除并关闭班级连接（删除班级时使用）
async function closeClassDb(dbFile) {
  const conn = classDbCache.get(dbFile);
  if (conn) {
    classDbCache.delete(dbFile);
    try { await conn.close(); } catch (e) { /* 连接已关闭，忽略 */ }
  }
}

// 班级库文件绝对路径（供创建/删除班级使用）
function classDbPath(dbFile) {
  return path.join(classDbDir, dbFile);
}

async function initDb() {
  const db = await getMainDb();

  // 班级注册表（主库持有）
  await db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      db_file TEXT NOT NULL UNIQUE,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 老用户一次性迁移：classes 表为空时，把现有主库注册为「默认班级」。
  // 复用主库文件本身（db_file='default'），不搬任何数据，零风险。
  const classCount = await db.get('SELECT COUNT(*) as c FROM classes');
  if (!classCount || classCount.c === 0) {
    await db.run("INSERT INTO classes (name, db_file, is_default) VALUES ('默认班级', 'default', 1)");
  }

  // 主库同时作为「默认班级」的业务库，初始化全部业务表
  await initClassDb(db);
}

// 初始化一个班级库的全部业务表与默认数据（主库与新建班级库共用此逻辑）
async function initClassDb(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      file_path TEXT,
      type TEXT,
      upload_time DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      type TEXT,
      content TEXT,
      resource_id INTEGER,
      analyze INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (resource_id) REFERENCES resources(id)
    );

    -- 考试记录表：关联考试和学生，存储每次考试的成绩、评语等
    CREATE TABLE IF NOT EXISTS exam_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exam_id INTEGER,
      student_id INTEGER,
      score REAL,
      comment TEXT,
      remark TEXT,
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (exam_id) REFERENCES exams(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 背书任务表（第一级）
    CREATE TABLE IF NOT EXISTS recitation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      image_path TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 背书记录表（第二级，关联学生和任务）
    CREATE TABLE IF NOT EXISTS recitation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status INTEGER DEFAULT 0,
      remark TEXT,
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES recitation_tasks(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    -- 保留旧的recitations表以兼容历史数据
    CREATE TABLE IF NOT EXISTS recitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      student_name TEXT,
      subject TEXT,
      article TEXT,
      status INTEGER DEFAULT 0
    );

    -- 作业任务表（第一级）
    CREATE TABLE IF NOT EXISTS homework_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT,
      content TEXT,
      homework_date TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 作业记录表（第二级，关联学生和任务）
    CREATE TABLE IF NOT EXISTS homework_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      status INTEGER DEFAULT 0,
      score REAL,
      remark TEXT,
      image_path TEXT,
      completed_at DATETIME,
      FOREIGN KEY (task_id) REFERENCES homework_tasks(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      gender TEXT,
      birth TEXT,
      parent_name TEXT,
      phone TEXT,
      family_info TEXT,
      address TEXT,
      is_special INTEGER DEFAULT 0,
      special_type TEXT,
      remark TEXT,
      avatar TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      subject TEXT,
      score REAL,
      exam_name TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      reason TEXT,
      points INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS leaves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      start_date TEXT,
      end_date TEXT,
      reason TEXT,
      status TEXT DEFAULT '登记',
      image_path TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      teacher_score REAL,
      final_grade TEXT,
      comment TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS communications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER,
      date TEXT,
      method TEXT,
      content TEXT,
      feedback TEXT,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- 课程表
    CREATE TABLE IF NOT EXISTS schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject TEXT NOT NULL,
      teacher TEXT,
      room TEXT,
      color TEXT,
      remark TEXT,
      UNIQUE(week_day, period)
    );

    -- 临时工作区任务
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      due_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- 资源功能类别（自定义分类，如"试卷"、"作业"等）
    CREATE TABLE IF NOT EXISTS resource_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // 为已存在的 recitations 表追加 student_id 列（关联 students 表，向后兼容旧数据）
  // 列已存在时会报错，忽略即可
  try {
    await db.run('ALTER TABLE recitations ADD COLUMN student_id INTEGER');
  } catch (e) { /* student_id 列已存在，忽略 */ }

  // 为已存在的 leaves 表追加 image_path 列（用于存储请假条图片路径）
  // 列已存在时会报错，忽略即可
  try {
    await db.run('ALTER TABLE leaves ADD COLUMN image_path TEXT');
  } catch (e) { /* image_path 列已存在，忽略 */ }

  // 为已存在的 exams 表追加 resource_id 列（关联资源表）
  try {
    await db.run('ALTER TABLE exams ADD COLUMN resource_id INTEGER');
  } catch (e) { /* resource_id 列已存在，忽略 */ }

  // 为已存在的 communications 表追加 attachments 列（存储附件文件名，逗号分隔）
  try {
    await db.run('ALTER TABLE communications ADD COLUMN attachments TEXT');
  } catch (e) { /* attachments 列已存在，忽略 */ }

  // 为已存在的 recitations 表追加 remark 列（备注）
  try {
    await db.run('ALTER TABLE recitations ADD COLUMN remark TEXT');
  } catch (e) { /* remark 列已存在，忽略 */ }

  // 为已存在的 exams 表追加 remark 列（备注）
  try {
    await db.run('ALTER TABLE exams ADD COLUMN remark TEXT');
  } catch (e) { /* remark 列已存在，忽略 */ }

  // 为已存在的 leaves 表追加 remark 列（备注）
  try {
    await db.run('ALTER TABLE leaves ADD COLUMN remark TEXT');
  } catch (e) { /* remark 列已存在，忽略 */ }

  // 为已存在的 students 表追加 grade 和 class 列（年级和班级）
  try {
    await db.run('ALTER TABLE students ADD COLUMN grade TEXT');
  } catch (e) { /* grade 列已存在，忽略 */ }
  try {
    await db.run('ALTER TABLE students ADD COLUMN class TEXT');
  } catch (e) { /* class 列已存在，忽略 */ }

  // 为已存在的 resources 表追加 category_id 列（关联 resource_categories 表）
  try {
    await db.run('ALTER TABLE resources ADD COLUMN category_id INTEGER');
  } catch (e) { /* category_id 列已存在，忽略 */ }

  // 为已存在的 homework_tasks 表追加 image_path 列（作业图片）
  try {
    await db.run('ALTER TABLE homework_tasks ADD COLUMN image_path TEXT');
  } catch (e) { /* image_path 列已存在，忽略 */ }

  // 为已存在的 exams 表追加 analyze 列（是否加入成绩分析）
  try {
    await db.run('ALTER TABLE exams ADD COLUMN analyze INTEGER DEFAULT 0');
  } catch (e) { /* analyze 列已存在，忽略 */ }

  // 为已存在的 exams 表追加 subject 列（科目，用于成绩同步分析）
  try {
    await db.run('ALTER TABLE exams ADD COLUMN subject TEXT');
  } catch (e) { /* subject 列已存在，忽略 */ }

  // 为已存在的 exam_records 表追加 image_path 列（考试记录图片，逗号分隔）
  try {
    await db.run('ALTER TABLE exam_records ADD COLUMN image_path TEXT');
  } catch (e) { /* image_path 列已存在，忽略 */ }

  // 为已存在的 homework_records 表追加 image_path 列（作业记录图片，逗号分隔）
  try {
    await db.run('ALTER TABLE homework_records ADD COLUMN image_path TEXT');
  } catch (e) { /* image_path 列已存在，忽略 */ }

  // 为已存在的 students 表追加 remark 和 avatar 列（备注和头像）
  try {
    await db.run('ALTER TABLE students ADD COLUMN remark TEXT');
  } catch (e) { /* remark 列已存在，忽略 */ }
  try {
    await db.run('ALTER TABLE students ADD COLUMN avatar TEXT');
  } catch (e) { /* avatar 列已存在，忽略 */ }

  // 为已存在的 schedule 表追加 time_slot 和 noon_remark 列（时间段和午间备注）
  try {
    await db.run('ALTER TABLE schedule ADD COLUMN time_slot TEXT');
  } catch (e) { /* time_slot 列已存在，忽略 */ }
  try {
    await db.run('ALTER TABLE schedule ADD COLUMN noon_remark TEXT');
  } catch (e) { /* noon_remark 列已存在，忽略 */ }

  // 插入默认教师名称（仅首次初始化时）
  const existing = await db.get("SELECT key FROM settings WHERE key = 'teacher_name'");
  if (!existing) {
    await db.run("INSERT INTO settings (key, value) VALUES ('teacher_name', '陈老师')");
  }

  // 插入默认登录配置（轻量级方案：明文存储，首次启动默认 admin / admin123）
  const existingAuthUser = await db.get("SELECT key FROM settings WHERE key = 'auth_username'");
  if (!existingAuthUser) {
    await db.run("INSERT INTO settings (key, value) VALUES ('auth_username', 'admin')");
  }
  const existingAuthPwd = await db.get("SELECT key FROM settings WHERE key = 'auth_password'");
  if (!existingAuthPwd) {
    await db.run("INSERT INTO settings (key, value) VALUES ('auth_password', 'admin123')");
  }

  // 初始化年级信息（入学年份、当前年级），仅首次初始化时插入
  const existingGradeYear = await db.get("SELECT key FROM settings WHERE key = 'grade_year'");
  if (!existingGradeYear) {
    await db.run("INSERT INTO settings (key, value) VALUES ('grade_year', '2025')");
  }
  const existingGradeLevel = await db.get("SELECT key FROM settings WHERE key = 'grade_level'");
  if (!existingGradeLevel) {
    await db.run("INSERT INTO settings (key, value) VALUES ('grade_level', '一年级')");
  }

  // 数据一致性修复：试卷科目回填（标题包含科目词时自动推断）
  const examRows = await db.all('SELECT id, title, subject FROM exams');
  for (const exam of examRows) {
    if (!exam.subject && exam.title) {
      const subjectWords = ['语文', '数学', '英语', '科学', '道法', '体育', '音乐', '美术'];
      const hit = subjectWords.find(w => exam.title.includes(w));
      if (hit) {
        await db.run('UPDATE exams SET subject = ? WHERE id = ?', [hit === '道法' ? '道德与法治' : hit, exam.id]);
      }
    }
  }

  // 数据一致性修复（一次性）：以「考试记录」为权威，同步成绩分析数据。
  // 注意：此修复含 DELETE 操作，重复执行会静默覆盖两表不一致时的手工修改，
  // 因此用 PRAGMA user_version 标记仅执行一次（每个数据库文件独立标记）
  const pragmaRow = await db.get('PRAGMA user_version');
  if (!pragmaRow || pragmaRow.user_version < 1) {
    for (const exam of examRows) {
      const countRow = await db.get('SELECT COUNT(*) AS c FROM exam_records WHERE exam_id = ?', [exam.id]);
      if (countRow.c > 0 && exam.title) {
        await db.run('DELETE FROM scores WHERE exam_name = ?', [exam.title]);
        const records = await db.all('SELECT student_id, score FROM exam_records WHERE exam_id = ? AND score IS NOT NULL', [exam.id]);
        for (const r of records) {
          await db.run(
            'INSERT INTO scores (student_id, subject, score, exam_name) VALUES (?, ?, ?, ?)',
            [r.student_id, exam.subject || '综合', r.score, exam.title]
          );
        }
      }
    }
    await db.run('PRAGMA user_version = 1');
    console.log('Data repair (exam_records -> scores sync) completed once.');
  }

  // 插入默认资源功能类别（仅首次初始化时）
  const existingCategories = await db.get("SELECT COUNT(*) as c FROM resource_categories");
  if (existingCategories && existingCategories.c === 0) {
    const defaultCategories = ['试卷', '作业', '课件', '教案', '学案', '素材'];
    for (const cat of defaultCategories) {
      await db.run("INSERT INTO resource_categories (name) VALUES (?)", [cat]);
    }
  }

  console.log('Database initialized and tables created/verified.');
}

module.exports = {
  getDb,
  getMainDb,
  initDb,
  initClassDb,
  runWithClass,
  closeClassDb,
  classDbPath
};
