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

// AI 批改任务表 DDL（抽为常量：initClassDb 建表与既有班级库补表共用，避免两处定义漂移）
// annotated_image_path / ocr_text 为二期（原图标注、本地OCR）预留字段
const AI_GRADING_TASKS_DDL = `
  CREATE TABLE IF NOT EXISTS ai_grading_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER,
    -- 批改对象来源（通用设计）：'exam'=试卷（默认，存量数据自动归属）、'homework'=作业。
    -- 作业来源时 source_id 存 homework_tasks.id 且 exam_id 为 NULL，JOIN 不会串到同号试卷。
    source_type TEXT DEFAULT 'exam',
    source_id INTEGER,
    student_id INTEGER,
    image_path TEXT,
    status TEXT DEFAULT 'pending',
    total_score REAL,
    full_score REAL,
    comment TEXT,
    detail TEXT,
    model TEXT,
    error TEXT,
    adopted INTEGER DEFAULT 0,
    adopted_at DATETIME,
    annotated_image_path TEXT,
    ocr_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exam_id) REFERENCES exams(id),
    FOREIGN KEY (student_id) REFERENCES students(id)
  );
`;

// 确保 AI 批改 schema 就绪并复位遗留任务（幂等，每库进程内一次性执行）：
//  1. 补建 ai_grading_tasks 表——兼容本次升级前已创建、不含该表的既有班级库，
//     否则非默认班级的 AI 接口会因 no such table 全部失败；
//  2. 将上次进程遗留的 pending/processing 任务复位为 failed——后台批改是内存态
//     fire-and-forget，进程重启后这些任务不会再推进，复位可避免前端无限轮询。
// 调用点：initClassDb（主库/新建班级）与 getDb 首次打开既有班级库连接。
async function ensureAiGradingSchema(db) {
  await db.exec(AI_GRADING_TASKS_DDL);
  await db.run(
    "UPDATE ai_grading_tasks SET status='failed', error='服务重启导致批改中断，请重新发起', updated_at=CURRENT_TIMESTAMP WHERE status IN ('pending','processing')"
  );
}

// 幂等补齐 exam_records 的 AI 批改明细列（detail TEXT，存逐题明细 JSON）。
// 用途：AI 批改任务属过程数据、可能被清理，而考试记录是长期留存的档案。
// 采纳时把逐题数据一并写入，之后即便删除批改任务，仍可在考试记录中回看与导出。
// 先用 PRAGMA 判断列是否存在，避免对已升级的库重复 ALTER 报错。
async function ensureExamRecordDetailColumn(db) {
  try {
    const cols = await db.all('PRAGMA table_info(exam_records)');
    if (Array.isArray(cols) && cols.length && !cols.some(c => c.name === 'detail')) {
      await db.run('ALTER TABLE exam_records ADD COLUMN detail TEXT');
    }
  } catch (e) {
    // 补列失败不应阻断启动：明细只是留存增强，主流程（成绩读写）不受影响
    console.warn('[db] exam_records.detail 补列失败，AI 明细留存功能不可用：', e && e.message);
  }
}

// 幂等补齐 ai_grading_tasks 的来源列（source_type/source_id）。
// 用途：AI 批改从「仅试卷」扩展到「试卷/作业」等多来源。
// 存量任务 source_type 保持 DEFAULT 'exam'，原有查询与采纳逻辑行为完全不变。
async function ensureAiGradingSourceColumns(db) {
  try {
    const cols = await db.all('PRAGMA table_info(ai_grading_tasks)');
    if (!Array.isArray(cols) || !cols.length) return; // 表尚不存在（ensureAiGradingSchema 稍后建）
    if (!cols.some(c => c.name === 'source_type')) {
      await db.run("ALTER TABLE ai_grading_tasks ADD COLUMN source_type TEXT DEFAULT 'exam'");
    }
    if (!cols.some(c => c.name === 'source_id')) {
      await db.run('ALTER TABLE ai_grading_tasks ADD COLUMN source_id INTEGER');
    }
  } catch (e) {
    // 补列失败不应阻断启动：AI 批改主流程（试卷来源）不受影响
    console.warn('[db] ai_grading_tasks 来源列补齐失败，作业批改功能不可用：', e && e.message);
  }
}

// 幂等补齐 homework_tasks 的 AI 批改参考答案列（answer_ref TEXT，与 exams.answer_ref 同构）。
// 用途：作业批改的评分依据；失败仅影响作业批改，作业管理主流程（布置/记录/打分）不受影响。
async function ensureHomeworkAnswerRefColumn(db) {
  try {
    const cols = await db.all('PRAGMA table_info(homework_tasks)');
    if (Array.isArray(cols) && cols.length && !cols.some(c => c.name === 'answer_ref')) {
      await db.run('ALTER TABLE homework_tasks ADD COLUMN answer_ref TEXT');
    }
  } catch (e) {
    console.warn('[db] homework_tasks.answer_ref 补列失败，作业批改参考答案不可用：', e && e.message);
  }
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
  // 既有班级库首次打开：补齐本次升级新增的表/列并复位遗留 AI 任务（幂等，仅进程内首次）
  await ensureAiGradingSchema(conn);
  await ensureExamRecordDetailColumn(conn);
  await ensureAiGradingSourceColumns(conn);
  await ensureHomeworkAnswerRefColumn(conn);
  classDbCache.set(ctx.dbFile, conn);
  return conn;
}

// 班级中间件调用：把当前请求绑定到指定班级库
function runWithClass(ctx, next) {
  classContext.run(ctx, next);
}

// 读取当前请求的班级上下文（供后台异步任务捕获并在脱离请求后透传，
// 例如 AI 批改任务在后台执行时仍需在正确的班级库读写数据）
function getClassContext() {
  return classContext.getStore();
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
      answer_ref TEXT,
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
      -- AI 批改参考答案（与 exams.answer_ref 同构：JSON {mode,text,images,parsed}）
      answer_ref TEXT,
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

  // 为已存在的 exams 表追加 answer_ref 列（AI 批改标准答案，JSON：mode/text/images/parsed）
  try {
    await db.run('ALTER TABLE exams ADD COLUMN answer_ref TEXT');
  } catch (e) { /* answer_ref 列已存在，忽略 */ }

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

  // AI 批改任务表统一由 ensureAiGradingSchema 建表并复位遗留任务
  // （主库/新建班级走此处；升级前已存在的班级库在 getDb 首次打开时补建）
  await ensureAiGradingSchema(db);
  await ensureExamRecordDetailColumn(db);
  // 新建库走 DDL 已含新列，此处调用幂等无害；主库若为升级前旧库则在此补齐
  await ensureAiGradingSourceColumns(db);
  await ensureHomeworkAnswerRefColumn(db);

  console.log('Database initialized and tables created/verified.');
}

module.exports = {
  getDb,
  getMainDb,
  initDb,
  initClassDb,
  runWithClass,
  getClassContext,
  closeClassDb,
  classDbPath
};
