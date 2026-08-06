const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

// 支持通过环境变量配置数据库路径，Docker 部署时指向持久化数据目录
const dbPath = process.env.DB_PATH || path.resolve(__dirname, 'database.sqlite');

let dbInstance = null;

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  return dbInstance;
}

async function initDb() {
  const db = await getDb();
  
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
      special_type TEXT
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
  initDb
};
