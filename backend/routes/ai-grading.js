const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { getDb, getMainDb, runWithClass, getClassContext } = require('../db');
const { PROVIDER_PRESETS, DEFAULT_SYSTEM_PROMPT, gradePaper, testConnection, normalizeQuestion, normalizeResult, normalizeConfidence } = require('../services/aiModel');

// AI 批改新上传图片：ai- 前缀标识为本功能独有，删除任务时可安全清理，
// 不会误删从考试记录复用的原图（沿用现有 uploads/ 磁盘存储风格）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'ai-' + uniqueSuffix + '-' + file.originalname);
  }
});
// 图片格式白名单：iPhone 默认拍出的是 HEIC，这类文件模型端无法识别、浏览器也预览不了，
// 在上传阶段就拦下并给出明确提示，避免任务跑了好几分钟才失败
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_IMAGE_EXT.includes(ext)) {
    const err = new Error(`不支持的图片格式（${ext || '未知'}）：请转换为 JPG / PNG 后重试。iPhone 拍摄的 HEIC 请在「设置-相机-格式」中改为「兼容性最佳」，或先另存为 JPG`);
    err.code = 'UNSUPPORTED_IMAGE_TYPE';
    return cb(err);
  }
  cb(null, true);
};

// 限制单文件 10MB、最多 12 张（试卷图 6 + 答案图 6）：AI 以 base64 内联传图，
// 超大图片会使请求体与内存暴涨甚至 OOM。各字段的 maxCount 在 upload.fields 里单独约束。
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 12 }, fileFilter: imageFileFilter });

// 包装上传中间件：把 multer 的英文错误码转成对用户友好的中文提示。
// 与试卷图片共用同一套 storage/fileFilter/limits（同为 ai- 前缀、同为图片），
// 答案图片与试卷图片合并在一次 multipart 请求里上传：试卷图走 images 字段、答案图走 answer_images 字段。
const uploadImages = (req, res, next) => {
  upload.fields([
    { name: 'images', maxCount: 6 },
    { name: 'answer_images', maxCount: 6 }
  ])(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '单张试卷图片不能超过 10MB，请压缩后重试'
      : err.code === 'LIMIT_FILE_COUNT' ? '单次最多上传 6 张试卷图片'
      : err.code === 'UNSUPPORTED_IMAGE_TYPE' ? err.message
        : '图片上传失败：' + err.message;
    return sendResponse(res, null, msg, 400);
  });
};

// 清理本次上传的图片文件——仅处理 ai- 前缀，且要求 basename 与原值一致、不含 ..，
// 防止 image_path 被构造成穿越到 uploads/ 之外造成误删（与删除任务的校验口径一致）
function cleanupUploaded(files) {
  (files || []).forEach((f) => {
    const name = f && f.filename;
    if (!name) return;
    const base = path.basename(name);
    if (base !== name || !base.startsWith('ai-') || name.includes('..')) return;
    const fp = path.join(__dirname, '..', 'uploads', base);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (e) { /* 忽略 */ } }
  });
}

// 标准响应（与 teacher.js / advisor.js 保持一致）
const sendResponse = (res, data = {}, message = 'success', code = 200) => {
  const httpStatus = code >= 200 && code < 600 ? code : 500;
  res.status(httpStatus).json({ code, message, data });
};

// 中文文件名下载头（与 teacher.js 一致，避免 Node 头字符异常）
function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`;
}

function resultLabel(r) {
  return { correct: '正确', wrong: '错误', partial: '部分正确', blank: '未作答', unknown: '待判定' }[r] || '待判定';
}

// 手工修正的逐题归一化：与模型输出的 normalizeQuestion 不同，这里老师是最终权威——
// 只做「字段映射 + 分数收敛到 [0,满分] + 判定枚举归一」，不对「判定 vs 分值」做自动纠正，
// 老师明确给出的判定原样保留；仅当判定缺省(unknown)时才按分值推导，避免覆盖人工选择。
function normalizeEditedQuestion(q, i) {
  if (!q || typeof q !== 'object') return null;
  let score = Number(q.score ?? q['得分'] ?? 0);
  const full = Number(q.full_score ?? q.max_score ?? q.fullscore ?? q['满分'] ?? 0);
  if (!Number.isFinite(score)) score = 0;
  if (full > 0) score = Math.min(Math.max(score, 0), full);
  else if (score < 0) score = 0;
  score = Math.round(score * 100) / 100;
  let result = normalizeResult(q.result ?? q.status ?? q['结果']);
  if (result === 'unknown') {
    if (full > 0) {
      result = score >= full ? 'correct' : (score <= 0 ? (String(q.student_answer ?? '').trim() ? 'wrong' : 'blank') : 'partial');
    } else {
      result = score > 0 ? 'partial' : (String(q.student_answer ?? '').trim() ? 'wrong' : 'blank');
    }
  }
  return {
    no: String(q.no ?? q.number ?? q.index ?? q['题号'] ?? i + 1),
    question: String(q.question ?? q.title ?? q['题目'] ?? ''),
    student_answer: String(q.student_answer ?? q.answer ?? q['学生答案'] ?? q['作答'] ?? ''),
    score,
    full_score: full > 0 ? Math.round(full * 100) / 100 : 0,
    result,
    // AI 自评置信度：老师编辑时原样保留（AI 原始值，不随人工改动重算），
    // 供「编辑」界面继续显示、以及编辑后仍能在只读视图按把握度排序复核。
    confidence: normalizeConfidence(q.confidence ?? q['置信度'] ?? q['自信度'] ?? q['把握度']),
    comment: String(q.comment ?? q.feedback ?? q['点评'] ?? q['评语'] ?? '')
  };
}

// ============ AI 配置（存主库 settings，跨班级共享；apiKey 不下发明文） ============

async function setSetting(db, key, value) {
  const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
  if (existing) {
    await db.run('UPDATE settings SET value = ? WHERE key = ?', [value, key]);
  } else {
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

function maskKey(key) {
  if (!key) return '';
  const s = String(key);
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

// ---------- 多供应商配置（存主库 settings，跨班级共享；apiKey 不下发明文） ----------
// ai_providers: 供应商数组；ai_active_provider: 当前使用的供应商 id；ai_enabled: 总开关
function genProviderId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 规范化供应商对象：补默认值、trim 关键字段；apiKey 单独传入以支持“留空则保留原值”
function normalizeProvider(raw, apiKeyOverride) {
  const p = raw || {};
  const apiKey = apiKeyOverride !== undefined ? apiKeyOverride : (p.api_key || '');
  const model = String(p.model || '').trim();
  const base_url = String(p.base_url || '').trim();
  return {
    id: p.id || genProviderId(),
    name: String(p.name || '').trim() || model || base_url || '未命名供应商',
    provider: p.provider || 'custom',
    base_url,
    api_key: apiKey,
    model,
    multimodal: p.multimodal !== undefined ? !!p.multimodal : true,
    temperature: (p.temperature !== undefined && p.temperature !== null && p.temperature !== '') ? Number(p.temperature) : 0.1,
    // max_tokens<=0 表示「不限制输出长度」：不下发该字段，交由模型按自身上下文上限自由生成。
    // 推理型模型的思考也占额度，限制过小会导致答案被截断，故默认不限制。
    max_tokens: (p.max_tokens !== undefined && p.max_tokens !== null && p.max_tokens !== '' && Number(p.max_tokens) > 0) ? Number(p.max_tokens) : 0,
    // 流式响应：默认开启（实时进度 + 空闲超时守护，慢速推理模型长卷也不会被误判超时）
    stream: p.stream !== undefined ? !!p.stream : true,
    // 思考模式：default=跟随模型（不干预思考长度，仅受总时长兜底）；
    //           limited=允许思考但限长（超过 thinking_limit 字仍未作答即中止，中止前先从思考里打捞答案）；
    //           suppress=尽力关闭思考（下发 enable_thinking=false 等开关）+ 同样限长。
    // 缺省 default，保证既有供应商行为不变。
    thinking_mode: (p.thinking_mode === 'suppress' || p.thinking_mode === 'limited') ? p.thinking_mode : 'default',
    // 思考上限（字符）：仅 limited / suppress 模式生效——思考超过此字数仍未作答即中止，防止失控空转。
    // 填 0 表示不限制思考长度（只受「流式总时长上限」兜底）。
    reasoning_limit: (p.reasoning_limit !== undefined && p.reasoning_limit !== null && p.reasoning_limit !== '')
      ? Math.max(0, Number(p.reasoning_limit) || 0)
      : 15000,
    system_prompt: p.system_prompt !== undefined ? String(p.system_prompt) : ''
  };
}

// 读取供应商列表与激活 id；enabled 支持环境变量兜底（容器化部署）
async function loadProviders() {
  const db = await getMainDb();
  const enabledRow = await db.get("SELECT value FROM settings WHERE key = 'ai_enabled'");
  const provRow = await db.get("SELECT value FROM settings WHERE key = 'ai_providers'");
  const activeRow = await db.get("SELECT value FROM settings WHERE key = 'ai_active_provider'");
  let providers = [];
  if (provRow && provRow.value) {
    try { const arr = JSON.parse(provRow.value); if (Array.isArray(arr)) providers = arr; } catch (e) { providers = []; }
  }
  const enabled = (enabledRow && enabledRow.value === '1') || process.env.AI_ENABLED === '1';
  return { enabled: !!enabled, providers, activeId: activeRow ? activeRow.value : '' };
}

// 图片上传压缩设置（全局、跨供应商）：压缩发生在前端上传时，与具体模型供应商无关。
// 默认最长边 2048、体积阈值 3MB、JPEG 质量 0.9——手写小字对分辨率敏感，不宜压得过狠；
// 看图/图形题对分辨率要求更高时，可在配置里调大最长边以保留细节。
const DEFAULT_UPLOAD = { max_edge: 2048, threshold_mb: 3, quality: 0.9 };

// 收敛压缩参数到安全范围，避免极端值导致前端 canvas 异常或图片被压糊
function sanitizeUploadSettings(s) {
  const max_edge = Number(s && s.max_edge);
  const threshold_mb = Number(s && s.threshold_mb);
  const quality = Number(s && s.quality);
  return {
    max_edge: Number.isFinite(max_edge) ? Math.min(Math.max(Math.round(max_edge), 512), 8192) : DEFAULT_UPLOAD.max_edge,
    threshold_mb: Number.isFinite(threshold_mb) ? Math.min(Math.max(threshold_mb, 0), 50) : DEFAULT_UPLOAD.threshold_mb,
    quality: Number.isFinite(quality) ? Math.min(Math.max(quality, 0.3), 1) : DEFAULT_UPLOAD.quality
  };
}

async function loadUploadSettings() {
  const db = await getMainDb();
  const row = await db.get("SELECT value FROM settings WHERE key = 'ai_upload_settings'");
  let s = DEFAULT_UPLOAD;
  if (row && row.value) {
    try {
      const p = JSON.parse(row.value);
      if (p && typeof p === 'object') s = { ...DEFAULT_UPLOAD, ...p };
    } catch (e) { /* 损坏则回退默认 */ }
  }
  return sanitizeUploadSettings(s);
}

async function saveUploadSettings(raw) {
  const s = sanitizeUploadSettings(raw || DEFAULT_UPLOAD);
  const db = await getMainDb();
  await setSetting(db, 'ai_upload_settings', JSON.stringify(s));
  return s;
}

async function saveProviders(providers, activeId) {
  const db = await getMainDb();
  await setSetting(db, 'ai_providers', JSON.stringify(providers));
  if (activeId !== undefined) await setSetting(db, 'ai_active_provider', String(activeId || ''));
}

// 当前激活供应商；激活 id 失效（如被删）时回退列表首个
function resolveActive(providers, activeId) {
  if (!Array.isArray(providers) || !providers.length) return null;
  return providers.find(p => p.id === activeId) || providers[0];
}

// 批改实际使用的配置：优先激活供应商，其次环境变量兜底（AI_BASE_URL / AI_MODEL）
async function loadActiveConfig() {
  const { enabled, providers, activeId } = await loadProviders();
  let config = resolveActive(providers, activeId);
  if (!config && (process.env.AI_BASE_URL || process.env.AI_MODEL)) {
    config = {
      base_url: process.env.AI_BASE_URL || '',
      api_key: process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || '',
      multimodal: true, temperature: 0.1,
      max_tokens: Number(process.env.AI_MAX_TOKENS) || 0, // 0=不限制输出长度
      stream: process.env.AI_STREAM !== '0', // 默认开启流式
      thinking_mode: (process.env.AI_THINKING_MODE === 'suppress' || process.env.AI_THINKING_MODE === 'limited')
        ? process.env.AI_THINKING_MODE : 'default',
      reasoning_limit: Number(process.env.AI_REASONING_LIMIT) || 15000,
      system_prompt: ''
    };
  }
  return { enabled, config: config || { base_url: '', model: '', api_key: '' } };
}

// GET /ai-grading/presets - 模型服务商预设与默认提示词
router.get('/ai-grading/presets', async (req, res) => {
  sendResponse(res, { presets: PROVIDER_PRESETS, default_system_prompt: DEFAULT_SYSTEM_PROMPT });
});

// GET /ai-grading/config - 总开关 + 供应商列表（apiKey 掩码）+ 当前激活 id
router.get('/ai-grading/config', async (req, res) => {
  try {
    const { enabled, providers, activeId } = await loadProviders();
    const list = providers.map(p => ({
      id: p.id, name: p.name, provider: p.provider, base_url: p.base_url, model: p.model,
      multimodal: p.multimodal, temperature: p.temperature, max_tokens: p.max_tokens,
      stream: p.stream !== false, // 缺省视为开启，与 normalizeProvider 默认一致
      thinking_mode: (p.thinking_mode === 'suppress' || p.thinking_mode === 'limited') ? p.thinking_mode : 'default', // 缺省 default
      reasoning_limit: (p.reasoning_limit !== undefined && p.reasoning_limit !== null) ? Number(p.reasoning_limit) || 0 : 15000,
      system_prompt: p.system_prompt, api_key_set: !!p.api_key, api_key_masked: maskKey(p.api_key)
    }));
    const active = resolveActive(providers, activeId);
    sendResponse(res, { enabled, providers: list, active_id: active ? active.id : '', upload: await loadUploadSettings() });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /ai-grading/config - 保存总开关（可一并指定当前激活供应商）
router.put('/ai-grading/config', async (req, res) => {
  try {
    const body = req.body || {};
    const enabled = (body.enabled === true || body.enabled === 1 || body.enabled === '1') ? '1' : '0';
    const db = await getMainDb();
    await setSetting(db, 'ai_enabled', enabled);
    if (body.active_id !== undefined) await setSetting(db, 'ai_active_provider', String(body.active_id || ''));
    let upload = await loadUploadSettings();
    if (body.upload && typeof body.upload === 'object') {
      upload = await saveUploadSettings(body.upload);
    }
    sendResponse(res, { enabled: enabled === '1', upload }, '已保存');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/providers - 新增供应商（首个自动设为当前使用）
router.post('/ai-grading/providers', async (req, res) => {
  try {
    const { providers, activeId } = await loadProviders();
    const p = normalizeProvider(req.body || {});
    if (!p.base_url || !p.model) return sendResponse(res, null, '服务地址（base_url）与模型名（model）不能为空', 400);
    providers.push(p);
    await saveProviders(providers, activeId || p.id);
    sendResponse(res, { id: p.id, name: p.name }, '供应商已添加');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /ai-grading/providers/:id - 编辑供应商（apiKey 留空或掩码则保留原值）
router.put('/ai-grading/providers/:id', async (req, res) => {
  try {
    const { providers, activeId } = await loadProviders();
    const idx = providers.findIndex(p => p.id === req.params.id);
    if (idx < 0) return sendResponse(res, null, '供应商不存在', 404);
    const body = req.body || {};
    let apiKey = body.api_key;
    if (apiKey === undefined || apiKey === null || apiKey === '' || String(apiKey).includes('****')) {
      apiKey = providers[idx].api_key || '';
    }
    const updated = normalizeProvider({ ...providers[idx], ...body, id: req.params.id }, apiKey);
    if (!updated.base_url || !updated.model) return sendResponse(res, null, '服务地址与模型名不能为空', 400);
    providers[idx] = updated;
    await saveProviders(providers, activeId);
    sendResponse(res, { id: updated.id, name: updated.name }, '供应商已更新');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /ai-grading/providers/:id - 删除供应商（删的是当前激活项则自动切到剩余首个）
router.delete('/ai-grading/providers/:id', async (req, res) => {
  try {
    const { providers, activeId } = await loadProviders();
    const next = providers.filter(p => p.id !== req.params.id);
    if (next.length === providers.length) return sendResponse(res, null, '供应商不存在', 404);
    const newActive = activeId === req.params.id ? (next.length ? next[0].id : '') : activeId;
    await saveProviders(next, newActive);
    sendResponse(res, null, '供应商已删除');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/providers/:id/activate - 切换当前使用的供应商
router.post('/ai-grading/providers/:id/activate', async (req, res) => {
  try {
    const { providers } = await loadProviders();
    const target = providers.find(p => p.id === req.params.id);
    if (!target) return sendResponse(res, null, '供应商不存在', 404);
    await saveProviders(providers, target.id);
    sendResponse(res, { active_id: target.id }, '已切换到「' + target.name + '」');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/providers/:id/test - 测试已保存供应商的连通性
router.post('/ai-grading/providers/:id/test', async (req, res) => {
  try {
    const { providers } = await loadProviders();
    const target = providers.find(p => p.id === req.params.id);
    if (!target) return sendResponse(res, null, '供应商不存在', 404);
    if (!target.base_url || !target.model) return sendResponse(res, null, '该供应商缺少服务地址或模型名', 400);
    const r = await testConnection(target);
    sendResponse(res, r, '连接成功，模型可用');
  } catch (err) {
    sendResponse(res, null, '连接失败：' + err.message, 400);
  }
});

// POST /ai-grading/test - 测试编辑中（未保存）的配置；带 provider_id 时复用其已存 apiKey
router.post('/ai-grading/test', async (req, res) => {
  try {
    const body = req.body || {};
    let apiKey = body.api_key;
    if ((!apiKey || String(apiKey).includes('****')) && body.provider_id) {
      const { providers } = await loadProviders();
      const t = providers.find(p => p.id === body.provider_id);
      if (t) apiKey = t.api_key;
    }
    const cfg = { ...body, api_key: apiKey || '' };
    if (!cfg.base_url || !cfg.model) {
      return sendResponse(res, null, '请先填写服务地址（base_url）与模型名（model）', 400);
    }
    const r = await testConnection(cfg);
    sendResponse(res, r, '连接成功，模型可用');
  } catch (err) {
    sendResponse(res, null, '连接失败：' + err.message, 400);
  }
});

// ============ AI 批改任务 ============

// 批改实时进度（taskId -> {stage, text, chars, elapsed_seconds, updated_at}）：
// 仅存内存、任务结束即清除。进度是瞬态信息无需落库；单进程部署下前端轮询 GET /tasks/:id
// 与本 Map 在同一进程，可直接读取，从而展示「模型思考中…已生成 N 字」的流式进度。
const taskProgress = new Map();

// 「主动停止」支持（taskId -> { aborted, controller }）：同样只存内存。
// 关键设计：控制器在**入队时**就注册，而不是等真正开始跑才注册——
// 这样排在队列里等待的任务也能被立即停止，不必等前面几个任务跑完才轮到它中止。
// 单进程部署下与前端轮询在同一进程，所以能直接中断正在进行的那次 HTTP 请求。
const taskControl = new Map();

function registerTaskControl(taskId) {
  const entry = { aborted: false, controller: new AbortController() };
  taskControl.set(String(taskId), entry);
  return entry;
}

function readTaskControl(taskId) {
  return taskControl.get(String(taskId)) || null;
}

// 把任务落库为「已停止」：与 failed 区分开——失败是意外（值得排查/重试），
// 已停止是老师主动取消（不该被当成异常统计，也不该误触发失败提示）。
async function markTaskCancelled(taskId, ctx, reason) {
  try {
    await runWithClass(ctx, async () => {
      const db = await getDb();
      await db.run(
        "UPDATE ai_grading_tasks SET status='cancelled', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')",
        [reason || '已手动停止批改', taskId]
      );
    });
  } catch (e) { /* 落库失败不影响中止本身：前端下次刷新会据实际状态展示 */ }
  taskProgress.delete(String(taskId));
}

// 批改任务并发上限：单进程部署下，多任务同时调用本地模型会互相争抢显存与内存，
// 且每个任务都会把最多 6 张图片一次性读进内存，并发过高极易拖垮整个服务（影响的不只是批改）。
// 默认串行执行，可用环境变量 AI_GRADING_CONCURRENCY 调大。
const MAX_CONCURRENT = Math.max(1, Number(process.env.AI_GRADING_CONCURRENCY) || 1);
let runningCount = 0;
const waitingQueue = [];

function acquireSlot() {
  if (runningCount < MAX_CONCURRENT) {
    runningCount += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingQueue.push(resolve));
}

function releaseSlot() {
  runningCount -= 1;
  if (waitingQueue.length) {
    runningCount += 1;
    const next = waitingQueue.shift();
    next();
  }
}

// 入队执行：占到一个并发名额后再跑，跑完（无论成功失败）必定释放，避免名额泄漏
async function enqueueGrading(taskId, ctx, config, imageFiles, examContext) {
  const control = registerTaskControl(taskId);
  await acquireSlot();
  try {
    // 排队期间被停止：不必占用模型资源，直接落库为「已停止」后让出名额
    if (control.aborted) {
      await markTaskCancelled(taskId, ctx, '已手动停止批改（排队中取消）');
      return;
    }
    await runGradingAsync(taskId, control, ctx, config, imageFiles, examContext);
  } finally {
    taskControl.delete(String(taskId));
    releaseSlot();
  }
}

// 后台异步执行批改：脱离请求上下文，用 runWithClass 透传班级库
async function runGradingAsync(taskId, control, ctx, config, imageFiles, examContext) {
  if (!ctx) {
    // 班级上下文缺失（仅主库解析异常的降级路径出现）：记录告警便于排查，
    // 行为与其它路由一致（getDb 回退默认班级库），不额外中断任务
    console.warn(`[ai-grading] 任务 ${taskId} 缺少班级上下文，将回退默认班级库执行`);
  }
  const withClass = (fn) => runWithClass(ctx, fn);
  try {
    await withClass(async () => {
      const db = await getDb();
      await db.run("UPDATE ai_grading_tasks SET status='processing', updated_at=CURRENT_TIMESTAMP WHERE id=?", [taskId]);
    });

    const absPaths = imageFiles.map(f => path.join(__dirname, '..', 'uploads', f));
    // 流式进度回调：把「思考中/作答中，已生成 N 字」以及停滞时长、疑似重复输出等
    // 写入内存 Map，供前端轮询展示（进度是瞬态信息，无需落库）
    const onProgress = (p) => { taskProgress.set(String(taskId), { ...p, updated_at: Date.now() }); };
    const result = await gradePaper(config, absPaths, examContext, onProgress, { signal: control.controller.signal });

    await withClass(async () => {
      const db = await getDb();
      const detail = JSON.stringify({
        questions: result.questions,
        raw: String(result.raw || '').slice(0, 20000)
      });
      await db.run(
        `UPDATE ai_grading_tasks SET status='success', total_score=?, full_score=?, comment=?, detail=?, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [result.total_score, result.full_score, result.overall_comment, detail, taskId]
      );
    });
  } catch (err) {
    // 被老师主动停止时落库为 cancelled（而非 failed）：语义不同，前端展示与批量统计也要分开。
    // 用条件更新兜住「停止的同一瞬间模型正好返回成功」的竞态——已成功的结果不该被覆盖。
    const aborted = !!(control && control.aborted);
    try {
      await withClass(async () => {
        const db = await getDb();
        await db.run(
          aborted
            ? "UPDATE ai_grading_tasks SET status='cancelled', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')"
            : "UPDATE ai_grading_tasks SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')",
          [aborted ? '已手动停止批改' : String(err.message || err).slice(0, 1000), taskId]
        );
      });
    } catch (e) { /* 兜底写库失败，忽略 */ }
  } finally {
    // 无论成功/失败都清理进度，避免 Map 泄漏；任务状态已落库，前端据 status 切换展示
    taskProgress.delete(String(taskId));
  }
}

// 解析 exams.content 为可读题目文本（与前端 renderContent 逻辑一致）
function examContentToText(content) {
  if (!content) return '';
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      // 结构化题目时把分值/参考答案一并带上：模型知道每题满分就不用靠猜，判分更准
      return parsed.map((q, i) => {
        const title = (q && typeof q === 'object')
          ? (q.question || q.title || JSON.stringify(q))
          : String(q);
        const extras = [];
        if (q && typeof q === 'object') {
          if (q.full_score !== undefined && q.full_score !== null && q.full_score !== '') extras.push(`满分 ${q.full_score}`);
          if (q.answer !== undefined && q.answer !== null && q.answer !== '') extras.push(`参考答案 ${q.answer}`);
        }
        return extras.length ? `${i + 1}. ${title}（${extras.join('，')}）` : `${i + 1}. ${title}`;
      }).join('\n');
    }
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  } catch (e) {
    return String(content);
  }
}

// ============ AI 批改标准答案（参考答案） ============
// 答案存 exams.answer_ref（试卷级属性），一次录入、多次批改复用；不随批改任务删除而丢失。
// answer_ref 为 JSON 字符串，结构：
//   { mode: 'text'|'image'|'none', text: '...', images: ['ai-ans-...jpg'], parsed: {...} }
// parsed 为「题号 -> 答案」映射，由文本解析而来（尽力而为，解析失败时仍保留原文供模型自行理解）。
// 说明：答案文件（.txt/.md/.csv）由前端读取文本内容后走「文本」通道（answer_text）提交，
//       后端无需额外解析文件，故文件输入口复用文本逻辑、零新增后端复杂度。

// 从自由文本中尽力解析「题号 -> 答案」映射：按行处理，识别行首的题号前缀（如 "1." "1、" "1)" "第1题"）。
// 缩进行视为上一题答案的续行；解析失败不报错——返回空对象，文本原文仍会原样下发给模型。
function parseAnswerText(text) {
  const s = String(text || '');
  const map = {};
  if (!s.trim()) return map;
  const lines = s.split(/\r?\n/);
  let lastNo = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 原行有前导空白 => 上一题答案的续行
    if (/^\s/.test(raw) && lastNo !== null) {
      map[lastNo] = (map[lastNo] !== undefined ? map[lastNo] + '\n' : '') + line;
      continue;
    }
    // 行首题号：数字/中文数字 + 可选「题」字 + 可选分隔符（. 、 ) ）: ： 】）
    const m = line.match(/^(?:第\s*)?([0-9一二三四五六七八九十]+)\s*(?:题)?\s*[.、)）:：】]?\s*(.*)$/);
    if (m && m[1]) {
      lastNo = m[1];
      const ans = m[2].trim();
      if (ans) map[lastNo] = ans;
    } else if (lastNo !== null) {
      // 无缩进的普通续行
      if (map[lastNo] !== undefined) map[lastNo] += '\n' + line;
    }
  }
  return map;
}

// 归一化 answer_ref 对象：校验 mode 枚举、收敛字段，返回 null 表示「无答案」。
function normalizeAnswerRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = raw.mode === 'text' || raw.mode === 'image' ? raw.mode : null;
  if (!mode) return null;
  const text = String(raw.text || '').slice(0, 20000);
  const images = Array.isArray(raw.images)
    ? raw.images.map(x => path.basename(String(x))).filter(x => x && x.startsWith('ai-') && !x.includes('..')).slice(0, 6)
    : [];
  if (mode === 'text' && !text.trim() && !images.length) return null;
  if (mode === 'image' && !images.length && !text.trim()) return null;
  const parsed = (mode === 'text' && text.trim()) ? parseAnswerText(text) : (raw.parsed && typeof raw.parsed === 'object' ? raw.parsed : {});
  return { mode, text, images, parsed };
}

// 判断某张试卷是否已录入答案
async function getExamAnswerRef(db, examId) {
  const row = await db.get('SELECT answer_ref FROM exams WHERE id = ?', [examId]);
  if (!row || !row.answer_ref) return null;
  try { return JSON.parse(row.answer_ref); } catch (e) { return null; }
}

// 按来源读取已录入的参考答案（试卷/作业同构），失败或未录入均返回 null
async function getSourceAnswerRef(db, sourceId, isHomework) {
  const row = isHomework
    ? await db.get('SELECT answer_ref FROM homework_tasks WHERE id = ?', [sourceId])
    : await db.get('SELECT answer_ref FROM exams WHERE id = ?', [sourceId]);
  if (!row || !row.answer_ref) return null;
  try { return JSON.parse(row.answer_ref); } catch (e) { return null; }
}

// GET /ai-grading/tasks - 任务列表（不含 detail 大字段）
router.get('/ai-grading/tasks', async (req, res) => {
  try {
    const db = await getDb();
    const { exam_id, student_id } = req.query;
    let sql = `
      SELECT t.id, t.exam_id, t.source_type, t.student_id, t.image_path, t.status, t.total_score, t.full_score,
             t.comment, t.model, t.error, t.adopted, t.adopted_at, t.created_at, t.updated_at,
             s.name AS student_name,
             COALESCE(e.title, ht.title) AS exam_title,
             COALESCE(e.subject, ht.subject) AS exam_subject
      FROM ai_grading_tasks t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN exams e ON t.exam_id = e.id
      LEFT JOIN homework_tasks ht ON t.source_type = 'homework' AND t.source_id = ht.id
      WHERE 1=1
    `;
    const params = [];
    if (exam_id) { sql += ' AND t.exam_id = ?'; params.push(exam_id); }
    if (student_id) { sql += ' AND t.student_id = ?'; params.push(student_id); }
    sql += ' ORDER BY t.created_at DESC';
    const rows = await db.all(sql, params);
    // 为进行中的任务附带实时进度（内存态），供列表/详情展示
    rows.forEach(r => {
      if (r.status === 'pending' || r.status === 'processing') r.progress = taskProgress.get(String(r.id)) || null;
    });
    sendResponse(res, rows);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/tasks - 创建批改任务（新上传图片，或复用该生该考试已有照片）
// 支持附带标准答案：answer_text（纯文本）或 answer_images（答案图片，走 answer_images 字段）。
// 答案存试卷级（exams.answer_ref），一次录入、后续批改自动复用。
// 作业批改：传 source_type='homework' + source_id（作业 id）即可，与试卷共用同一套
// 图片复用 / 答案复用 / 并发队列 / 重复保护，答案存作业级（homework_tasks.answer_ref）。
router.post('/ai-grading/tasks', uploadImages, async (req, res) => {
  try {
    const { enabled, config } = await loadActiveConfig();
    if (!enabled) return sendResponse(res, null, 'AI 批改功能未开启，请先在「模型配置」中开启并保存', 400);
    if (!config.base_url || !config.model) {
      return sendResponse(res, null, '模型未正确配置（缺少服务地址或模型名），请先完成配置', 400);
    }

    const { exam_id, student_id, source_type, source_id } = req.body;
    // 来源解析：homework 走作业链路；其余（含不传）一律按试卷处理，兼容既有调用方
    const isHomework = source_type === 'homework' && source_id;
    if (!student_id) return sendResponse(res, null, 'student_id 不能为空', 400);
    if (!isHomework && !exam_id) return sendResponse(res, null, 'exam_id 与 student_id 不能为空', 400);

    const db = await getDb();
    // 来源对象：试卷或作业（作业取 title/subject/content/answer_ref，与 exams 同构）
    let sourceObj = null;
    if (isHomework) {
      sourceObj = await db.get('SELECT id, title, subject, content, answer_ref FROM homework_tasks WHERE id = ?', [source_id]);
      if (!sourceObj) return sendResponse(res, null, '作业不存在', 404);
    } else {
      sourceObj = await db.get('SELECT id, title, subject, content, answer_ref FROM exams WHERE id = ?', [exam_id]);
      if (!sourceObj) return sendResponse(res, null, '试卷不存在', 404);
    }
    const student = await db.get('SELECT id, name FROM students WHERE id = ?', [student_id]);
    if (!student) return sendResponse(res, null, '学生不存在', 404);

    // 本次上传的答案图片（若有）
    const answerImages = (req.files && req.files.answer_images)
      ? req.files.answer_images.map(f => f.filename)
      : [];

    // 解析本次提交的答案（文本 + 图片）；未提交则回退来源级已存答案
    const answerTextRaw = String(req.body.answer_text || '').trim();
    let answerRef = null;
    if (answerTextRaw || answerImages.length) {
      answerRef = normalizeAnswerRef({
        mode: 'text',
        text: answerTextRaw,
        images: answerImages
      });
      if (answerRef) {
        // 持久化到来源级：一次录入、多次批改复用。答案文本可留空（仅图片），图片可留空（仅文本）。
        if (isHomework) {
          await db.run('UPDATE homework_tasks SET answer_ref = ? WHERE id = ?', [JSON.stringify(answerRef), source_id]);
        } else {
          await db.run('UPDATE exams SET answer_ref = ? WHERE id = ?', [JSON.stringify(answerRef), exam_id]);
        }
      }
    }
    if (!answerRef) {
      // 本次未提供答案，读取来源级已存答案（复用）
      answerRef = await getSourceAnswerRef(db, isHomework ? source_id : exam_id, isHomework);
    }

    // 重复提交保护：同一学生同一来源已有在跑的任务时直接复用。
    // 老师连点两次就会发起两次完整调用（本地模型一次要几分钟），既浪费也更容易把服务压垮。
    const dupCond = isHomework
      ? "source_type = 'homework' AND source_id = ?"
      : "source_type = 'exam' AND exam_id = ?";
    const dup = await db.get(
      `SELECT id, status FROM ai_grading_tasks WHERE ${dupCond} AND student_id = ? AND status IN ('pending','processing') ORDER BY id DESC LIMIT 1`,
      isHomework ? [source_id, student_id] : [exam_id, student_id]
    );
    if (dup) {
      cleanupUploaded(req.files && req.files.images);
      cleanupUploaded(req.files && req.files.answer_images);
      return sendResponse(res, { id: dup.id, status: dup.status, reused: true },
        `该学生的这份${isHomework ? '作业' : '试卷'}正在批改中，已为你打开已有任务`);
    }

    // 图片来源：优先本次上传；否则复用该生该来源记录里已有的照片
    // （exam_records 与 homework_records 的 image_path 均为「逗号分隔多张文件名」，格式完全一致）
    let imageFiles = [];
    if (req.files && req.files.images && req.files.images.length) {
      imageFiles = req.files.images.map(f => f.filename);
    } else {
      const rec = isHomework
        ? await db.get('SELECT image_path FROM homework_records WHERE task_id = ? AND student_id = ?', [source_id, student_id])
        : await db.get('SELECT image_path FROM exam_records WHERE exam_id = ? AND student_id = ?', [exam_id, student_id]);
      if (rec && rec.image_path) imageFiles = rec.image_path.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!imageFiles.length) {
      cleanupUploaded(req.files && req.files.answer_images);
      return sendResponse(res, null, `请上传${isHomework ? '作业' : '试卷'}图片，或确保该学生已有${isHomework ? '作业' : '试卷'}照片`, 400);
    }

    const result = await db.run(
      isHomework
        ? `INSERT INTO ai_grading_tasks (exam_id, source_type, source_id, student_id, image_path, status, model) VALUES (NULL, 'homework', ?, ?, ?, 'pending', ?)`
        : `INSERT INTO ai_grading_tasks (exam_id, source_type, source_id, student_id, image_path, status, model) VALUES (?, 'exam', NULL, ?, ?, 'pending', ?)`,
      isHomework
        ? [source_id, student_id, imageFiles.join(','), config.model]
        : [exam_id, student_id, imageFiles.join(','), config.model]
    );
    const taskId = result.lastID;

    const ctx = getClassContext();
    // examContext 与来源无关（title/subject/content/answer_ref 四元组作业完全同构），
    // 批改引擎（队列/模型调用/进度/守护）无需感知来源
    const examContext = {
      title: sourceObj.title,
      subject: sourceObj.subject,
      content: examContentToText(sourceObj.content),
      answer_ref: answerRef
    };
    // 后台执行，不阻塞响应（LLM 调用耗时长，前端改为轮询任务状态）；经队列限流后启动
    enqueueGrading(taskId, ctx, config, imageFiles, examContext);

    sendResponse(res, { id: taskId, status: 'pending', has_answer: !!answerRef });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/tasks/batch - 批量批改：一次把某试卷/作业下「已有照片」的学生全部发起批改。
// 与单任务创建共用同一套能力（图片复用 / 答案复用 / 并发队列 / 重复保护），仅多一层「逐个学生遍历」。
// 作业批量：传 source_type='homework' + source_id 即可，学生照片取 homework_records.image_path。
// 关键安全边界：
//  1) 无照片的学生绝不建任务（只返回名单，由前端提示老师去补照片）；
//  2) 已有 pending/processing 任务的学生直接跳过（复用现有 dup 保护，避免重复烧钱/重复批改）；
//  3) 答案（answer_ref）为来源级，自动复用到每个学生，无需重复录入。
router.post('/ai-grading/tasks/batch', async (req, res) => {
  try {
    const { enabled, config } = await loadActiveConfig();
    if (!enabled) return sendResponse(res, null, 'AI 批改功能未开启，请先在「模型配置」中开启并保存', 400);
    if (!config.base_url || !config.model) {
      return sendResponse(res, null, '模型未正确配置（缺少服务地址或模型名），请先完成配置', 400);
    }

    const { exam_id, student_ids, source_type, source_id } = req.body || {};
    const isHomework = source_type === 'homework' && source_id;
    if (!isHomework && !exam_id) return sendResponse(res, null, 'exam_id 不能为空', 400);

    const db = await getDb();
    let sourceObj = null;
    if (isHomework) {
      sourceObj = await db.get('SELECT id, title, subject, content, answer_ref FROM homework_tasks WHERE id = ?', [source_id]);
      if (!sourceObj) return sendResponse(res, null, '作业不存在', 404);
    } else {
      sourceObj = await db.get('SELECT id, title, subject, content, answer_ref FROM exams WHERE id = ?', [exam_id]);
      if (!sourceObj) return sendResponse(res, null, '试卷不存在', 404);
    }

    // 答案：批量场景复用来源级已存答案（若有）；本次无答案输入口，保持与单任务「复用已存答案」一致
    const answerRef = await getSourceAnswerRef(db, isHomework ? source_id : exam_id, isHomework);
    const examContext = {
      title: sourceObj.title,
      subject: sourceObj.subject,
      content: examContentToText(sourceObj.content),
      answer_ref: answerRef
    };

    // 学生范围：未指定 student_ids 时，取该来源记录里的全部学生（试卷=考试记录、作业=作业记录）
    let targets;
    if (Array.isArray(student_ids) && student_ids.length) {
      const ids = [...new Set(student_ids.map(x => Number(x)).filter(Number.isFinite))];
      if (!ids.length) return sendResponse(res, null, '学生列表为空', 400);
      const ph = ids.map(() => '?').join(',');
      targets = await db.all(`SELECT s.id, s.name FROM students s WHERE s.id IN (${ph})`, ids);
    } else if (isHomework) {
      targets = await db.all(`
        SELECT s.id, s.name FROM homework_records hr
        JOIN students s ON hr.student_id = s.id
        WHERE hr.task_id = ?
        ORDER BY s.id ASC
      `, [source_id]);
    } else {
      targets = await db.all(`
        SELECT s.id, s.name FROM exam_records er
        JOIN students s ON er.student_id = s.id
        WHERE er.exam_id = ?
        ORDER BY s.id ASC
      `, [exam_id]);
    }

    const ctx = getClassContext();
    const created = [];
    const skipped_no_image = [];
    const skipped_running = [];
    const skipped_no_student = [];

    for (const stu of targets) {
      const sid = stu.id;
      // 重复保护：该生该来源已有在跑任务则跳过（与单任务创建口径一致）
      const dupCond = isHomework
        ? "source_type = 'homework' AND source_id = ?"
        : "source_type = 'exam' AND exam_id = ?";
      const dup = await db.get(
        `SELECT id, status FROM ai_grading_tasks WHERE ${dupCond} AND student_id = ? AND status IN ('pending','processing') ORDER BY id DESC LIMIT 1`,
        isHomework ? [source_id, sid] : [exam_id, sid]
      );
      if (dup) {
        skipped_running.push({ id: sid, name: stu.name, task_id: dup.id });
        continue;
      }

      // 图片来源：复用该生该来源记录里已有的照片（批量场景不上传新图）
      const rec = isHomework
        ? await db.get('SELECT image_path FROM homework_records WHERE task_id = ? AND student_id = ?', [source_id, sid])
        : await db.get('SELECT image_path FROM exam_records WHERE exam_id = ? AND student_id = ?', [exam_id, sid]);
      const imageFiles = rec && rec.image_path
        ? rec.image_path.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      if (!imageFiles.length) {
        skipped_no_image.push({ id: sid, name: stu.name });
        continue;
      }

      const result = await db.run(
        isHomework
          ? `INSERT INTO ai_grading_tasks (exam_id, source_type, source_id, student_id, image_path, status, model) VALUES (NULL, 'homework', ?, ?, ?, 'pending', ?)`
          : `INSERT INTO ai_grading_tasks (exam_id, source_type, source_id, student_id, image_path, status, model) VALUES (?, 'exam', NULL, ?, ?, 'pending', ?)`,
        isHomework
          ? [source_id, sid, imageFiles.join(','), config.model]
          : [exam_id, sid, imageFiles.join(','), config.model]
      );
      const taskId = result.lastID;
      created.push({ id: sid, name: stu.name, task_id: taskId });
      enqueueGrading(taskId, ctx, config, imageFiles, examContext);
    }

    sendResponse(res, {
      total: targets.length,
      created: created.length,
      task_ids: created.map(c => c.task_id),
      created_students: created.map(c => ({ id: c.id, name: c.name })),
      skipped_no_image,
      skipped_running,
      skipped_no_student,
      has_answer: !!answerRef
    }, `已发起 ${created.length} 份批改`);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /ai-grading/exams/:id/answer-ref - 读取某张试卷已录入的标准答案
router.get('/ai-grading/exams/:id/answer-ref', async (req, res) => {
  try {
    const db = await getDb();
    const answerRef = await getExamAnswerRef(db, req.params.id);
    sendResponse(res, { answer_ref: answerRef });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /ai-grading/exams/:id/answer-ref - 保存/清空某张试卷的标准答案
// body: { answer_ref: {...} } 保存；{ answer_ref: null } 清空
router.put('/ai-grading/exams/:id/answer-ref', async (req, res) => {
  try {
    const db = await getDb();
    const exam = await db.get('SELECT id FROM exams WHERE id = ?', [req.params.id]);
    if (!exam) return sendResponse(res, null, '试卷不存在', 404);
    const body = req.body || {};
    if (body.answer_ref === null || body.answer_ref === undefined) {
      await db.run('UPDATE exams SET answer_ref = NULL WHERE id = ?', [req.params.id]);
      return sendResponse(res, { answer_ref: null }, '已清空答案');
    }
    const answerRef = normalizeAnswerRef(body.answer_ref);
    if (!answerRef) return sendResponse(res, null, '答案内容为空或格式不正确', 400);
    await db.run('UPDATE exams SET answer_ref = ? WHERE id = ?', [JSON.stringify(answerRef), req.params.id]);
    sendResponse(res, { answer_ref: answerRef }, '答案已保存');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /ai-grading/homework/:id/answer-ref - 读取某份作业已录入的标准答案（与试卷端点同构）
router.get('/ai-grading/homework/:id/answer-ref', async (req, res) => {
  try {
    const db = await getDb();
    const answerRef = await getSourceAnswerRef(db, req.params.id, true);
    sendResponse(res, { answer_ref: answerRef });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /ai-grading/homework/:id/answer-ref - 保存/清空某份作业的标准答案（与试卷端点同构）
// body: { answer_ref: {...} } 保存；{ answer_ref: null } 清空
router.put('/ai-grading/homework/:id/answer-ref', async (req, res) => {
  try {
    const db = await getDb();
    const hw = await db.get('SELECT id FROM homework_tasks WHERE id = ?', [req.params.id]);
    if (!hw) return sendResponse(res, null, '作业不存在', 404);
    const body = req.body || {};
    if (body.answer_ref === null || body.answer_ref === undefined) {
      await db.run('UPDATE homework_tasks SET answer_ref = NULL WHERE id = ?', [req.params.id]);
      return sendResponse(res, { answer_ref: null }, '答案已清空');
    }
    const answerRef = normalizeAnswerRef(body.answer_ref);
    if (!answerRef) return sendResponse(res, null, '答案内容为空或格式不正确', 400);
    await db.run('UPDATE homework_tasks SET answer_ref = ? WHERE id = ?', [JSON.stringify(answerRef), req.params.id]);
    sendResponse(res, { answer_ref: answerRef }, '答案已保存');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /ai-grading/tasks/:id - 任务详情（解析 detail）
router.get('/ai-grading/tasks/:id', async (req, res) => {
  try {
    const db = await getDb();
    const row = await db.get(`
      SELECT t.*, s.name AS student_name,
             COALESCE(e.title, ht.title) AS exam_title,
             COALESCE(e.subject, ht.subject) AS exam_subject
      FROM ai_grading_tasks t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN exams e ON t.exam_id = e.id
      LEFT JOIN homework_tasks ht ON t.source_type = 'homework' AND t.source_id = ht.id
      WHERE t.id = ?
    `, [req.params.id]);
    if (!row) return sendResponse(res, null, '任务不存在', 404);
    let detail = null;
    if (row.detail) {
      try { detail = JSON.parse(row.detail); } catch (e) { detail = null; }
    }
    row.detail = detail;
    // 进行中附带实时进度（内存态）：前端详情弹窗每 2.5s 轮询即可看到「已生成 N 字」
    row.progress = (row.status === 'pending' || row.status === 'processing')
      ? (taskProgress.get(String(row.id)) || null)
      : null;
    sendResponse(res, row);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// PUT /ai-grading/tasks/:id/result - 手工修正批改结果：老师可逐题改分数/判定/点评、
// 增删题目、改总分与总评。保存后即成为该任务的最终结果，后续采纳/导出均以修正后数据为准。
// 已采纳过的任务仍可再改，改完再点「采纳」即按 UPSERT 覆盖考试记录，无需额外接口。
router.put('/ai-grading/tasks/:id/result', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const task = await db.get('SELECT * FROM ai_grading_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    if (task.status !== 'success') return sendResponse(res, null, '该任务尚未批改成功，无法编辑', 400);

    const body = req.body || {};
    if (!Array.isArray(body.questions)) return sendResponse(res, null, '缺少题目明细（questions）', 400);
    const questions = body.questions.map(normalizeEditedQuestion).filter(Boolean);
    if (!questions.length) return sendResponse(res, null, '题目明细为空', 400);

    // 总分/满分：老师显式给出则以其为准，否则按逐题合计兜底；满分无逐题信息时沿用原任务值
    const sumScore = Math.round(questions.reduce((s, q) => s + q.score, 0) * 100) / 100;
    const sumFull = Math.round(questions.reduce((s, q) => s + q.full_score, 0) * 100) / 100;
    const hasTotal = body.total_score !== undefined && body.total_score !== null && body.total_score !== '';
    const hasFull = body.full_score !== undefined && body.full_score !== null && body.full_score !== '';
    const totalScore = hasTotal ? Number(body.total_score) : sumScore;
    const fullScore = hasFull ? Number(body.full_score) : (sumFull || task.full_score || 100);
    if (!Number.isFinite(totalScore) || totalScore < 0) return sendResponse(res, null, '总分非法，请输入 0 或正数', 400);
    if (!Number.isFinite(fullScore) || fullScore < 0) return sendResponse(res, null, '满分非法，请输入 0 或正数', 400);

    const overall = body.overall_comment !== undefined && body.overall_comment !== null
      ? String(body.overall_comment)
      : (task.comment || '');

    const detail = {
      full_score: Math.round(fullScore * 100) / 100,
      total_score: Math.round(totalScore * 100) / 100,
      overall_comment: overall,
      questions,
      manual_edited: true,
      manual_edited_at: new Date().toISOString()
    };

    await db.run(
      'UPDATE ai_grading_tasks SET total_score = ?, full_score = ?, comment = ?, detail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [detail.total_score, detail.full_score, overall, JSON.stringify(detail), id]
    );

    sendResponse(res, detail, '已保存修改');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/tasks/:id/adopt - 采纳成绩：写回考试记录并同步成绩分析
router.post('/ai-grading/tasks/:id/adopt', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const task = await db.get('SELECT * FROM ai_grading_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);
    if (task.status !== 'success') return sendResponse(res, null, '该任务尚未批改成功，无法采纳', 400);

    // 老师拥有最终决定权：可用 body.score / body.comment 覆盖 AI 结果
    let score = task.total_score;
    if (req.body.score !== undefined && req.body.score !== null && req.body.score !== '') {
      const n = Number(req.body.score);
      // 防御非法分数：NaN 会被 sqlite 静默存成 NULL，进而连带清空该生在成绩分析中的记录
      if (!Number.isFinite(n) || n < 0) {
        return sendResponse(res, null, '分数非法，请输入 0 或正数', 400);
      }
      score = n;
    }
    const comment = req.body.comment !== undefined ? req.body.comment : (task.comment || '');

    // 逐题明细一并留存到考试记录：AI 批改任务属过程数据、可能被清理，
    // 而考试记录是长期档案。存下来后，即便任务被删除仍可回看与导出。
    // 注意：若本次没有明细（例如手工补录成绩），不去覆盖已有明细，避免误清历史数据。
    let detailJson = null;
    if (task.detail) {
      try {
        const d = JSON.parse(task.detail);
        const qs = d && Array.isArray(d.questions) ? d.questions : [];
        if (qs.length) detailJson = JSON.stringify({ ...d, questions: qs });
      } catch (e) { /* 明细异常不影响采纳主流程 */ }
    }

    // 写入/更新来源记录：试卷→考试记录（并同步成绩分析）；作业→作业记录（分数+评语）
    const isHomework = task.source_type === 'homework';
    let recId;
    if (isHomework) {
      // 作业采纳：写 homework_records（score + remark 评语）。
      // 逐题明细（detail）作业记录表没有对应列，仅保留在批改任务详情中回看，不落作业记录。
      const hwRec = await db.get('SELECT id FROM homework_records WHERE task_id = ? AND student_id = ?', [task.source_id, task.student_id]);
      if (hwRec) {
        recId = hwRec.id;
        await db.run('UPDATE homework_records SET score = ?, remark = ? WHERE id = ?', [score, comment, recId]);
      } else {
        const r = await db.run('INSERT INTO homework_records (task_id, student_id, score, remark) VALUES (?, ?, ?, ?)',
          [task.source_id, task.student_id, score, comment]);
        recId = r.lastID;
      }
    } else {
      let rec = await db.get('SELECT id FROM exam_records WHERE exam_id = ? AND student_id = ?', [task.exam_id, task.student_id]);
      if (rec) {
        recId = rec.id;
        if (detailJson) {
          await db.run('UPDATE exam_records SET score = ?, comment = ?, detail = ? WHERE id = ?', [score, comment, detailJson, recId]);
        } else {
          await db.run('UPDATE exam_records SET score = ?, comment = ? WHERE id = ?', [score, comment, recId]);
        }
      } else {
        const r = await db.run('INSERT INTO exam_records (exam_id, student_id, score, comment, detail) VALUES (?, ?, ?, ?, ?)',
          [task.exam_id, task.student_id, score, comment, detailJson]);
        recId = r.lastID;
      }

      // 同步成绩分析（scores 表），逻辑与 teacher.js 更新考试记录一致
      const record = await db.get(
        'SELECT er.student_id, er.score, e.title AS exam_title, e.subject AS exam_subject FROM exam_records er LEFT JOIN exams e ON er.exam_id = e.id WHERE er.id = ?',
        [recId]
      );
      if (record && record.exam_title) {
        await db.run('DELETE FROM scores WHERE exam_name = ? AND student_id = ?', [record.exam_title, record.student_id]);
        if (record.score !== null && record.score !== undefined && record.score !== '') {
          const existSubject = await db.get("SELECT subject FROM scores WHERE exam_name = ? AND subject IS NOT NULL AND subject != ? LIMIT 1", [record.exam_title, '']);
          const subject = record.exam_subject || (existSubject ? existSubject.subject : '综合');
          await db.run('INSERT INTO scores (student_id, subject, score, exam_name) VALUES (?, ?, ?, ?)',
            [record.student_id, subject, record.score, record.exam_title]);
        }
      }
    }

    await db.run('UPDATE ai_grading_tasks SET adopted = 1, adopted_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    sendResponse(res, { id, score, exam_record_id: recId }, isHomework ? '已采纳到作业记录' : '已采纳到成绩');
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/tasks/:id/cancel - 手动停止批改（排队中或正在跑的都支持）
// 做两件事：① 立刻中止对模型的等待并断开连接（随即释放并发名额，让队列后面的任务能开跑）；
//          ② 把任务标记为「已停止」，前端不再显示「批改中」。
// 诚实边界：平台侧**一定**立即停止等待；模型侧是否同时停止生成取决于模型服务——
// LM Studio / Ollama / llama.cpp 等本地推理服务在连接断开后会停止生成，个别云服务或中转
// 可能把这一轮跑完（不影响本平台，只是仍占用其自身算力）。
router.post('/ai-grading/tasks/:id/cancel', async (req, res) => {
  const id = String(req.params.id);
  try {
    const db = await getDb();
    const task = await db.get('SELECT id, status FROM ai_grading_tasks WHERE id = ?', [id]);
    if (!task) return sendResponse(res, null, '任务不存在', 404);

    const control = readTaskControl(id);
    if (control) {
      control.aborted = true;
      try { control.controller.abort(); } catch (e) { /* 已结束则忽略 */ }
      // 还在排队（pending）的任务不会马上走到 runGradingAsync 的落库分支，
      // 这里先写一次状态，让前端立刻看到「已停止」而不是继续显示「等待中」；
      // 加上 status='pending' 条件，避免把恰好刚跑完/已失败的结果覆盖掉。
      if (task.status === 'pending') {
        // 用请求作用域内的 db（已是班级库）直接落库，与删除任务等路由同一口径
        await db.run(
          "UPDATE ai_grading_tasks SET status='cancelled', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",
          ['已手动停止批改（排队中取消）', id]
        );
        taskProgress.delete(id);
      }
      return sendResponse(res, { id, status: 'cancelled' }, '已停止批改');
    }

    // 无控制器：服务重启后遗留在 pending/processing 的任务（进程内状态已随重启丢失，
    // 实际已无进程在跑），无法再中止，但可以直接修正状态，避免列表里永远挂着「批改中」。
    if (task.status === 'pending' || task.status === 'processing') {
      await db.run(
        "UPDATE ai_grading_tasks SET status='cancelled', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('pending','processing')",
        ['服务重启后原批改进程已不存在，已标记为停止', id]
      );
      taskProgress.delete(id);
      return sendResponse(res, { id, status: 'cancelled' }, '已停止批改');
    }
    sendResponse(res, null, '该任务已结束，无需停止', 400);
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// POST /ai-grading/tasks/cancel-batch - 批量停止批改（供「批量批改」进度面板使用）
// 存在意义：批量发起后逐个停止是无效的——停掉正在跑的那个，队列里的下一个会立刻接上开跑，
// 老师的主观感受就是「根本停不下来」。这里一次性把整批（或当前库全部在跑的）都停掉。
// body: { task_ids?: (number|string)[] }；不传或为空时，停止当前班级库中所有 pending/processing 任务。
router.post('/ai-grading/tasks/cancel-batch', async (req, res) => {
  try {
    const db = await getDb();
    const rawIds = Array.isArray(req.body && req.body.task_ids) ? req.body.task_ids : [];
    const ids = [...new Set(rawIds.map((x) => String(x).trim()).filter(Boolean))];

    let targets;
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      targets = await db.all(
        `SELECT id FROM ai_grading_tasks WHERE id IN (${ph}) AND status IN ('pending','processing')`,
        ids
      );
    } else {
      targets = await db.all("SELECT id FROM ai_grading_tasks WHERE status IN ('pending','processing')");
    }

    // ① 先让控制器生效：正在跑的立刻断开与模型的连接并结束等待；
    //    排队中的任务标记 aborted，排到名额时会直接落库为「已停止」而不去调用模型。
    for (const t of targets) {
      const control = readTaskControl(t.id);
      if (control) {
        control.aborted = true;
        try { control.controller.abort(); } catch (e) { /* 已结束则忽略 */ }
      }
    }

    // ② 统一落库：条件更新兜住「停止的同一瞬间模型正好返回成功」的竞态
    let stopped = 0;
    if (targets.length) {
      const ph = targets.map(() => '?').join(',');
      const r = await db.run(
        `UPDATE ai_grading_tasks SET status='cancelled', error=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${ph}) AND status IN ('pending','processing')`,
        ['已手动停止批改（批量停止）', ...targets.map((t) => t.id)]
      );
      stopped = r && typeof r.changes === 'number' ? r.changes : targets.length;
      for (const t of targets) taskProgress.delete(String(t.id));
    }

    sendResponse(
      res,
      { stopped, task_ids: targets.map((t) => t.id) },
      stopped ? `已停止 ${stopped} 个批改任务` : '没有正在进行的批改任务'
    );
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// DELETE /ai-grading/tasks/:id - 删除任务（仅清理本功能新上传的 ai- 图片）
router.delete('/ai-grading/tasks/:id', async (req, res) => {
  try {
    const db = await getDb();
    // 删除一个仍在跑的任务时一并中止：否则进程会继续等模型、白烧显存，而结果已无处可存
    const control = readTaskControl(String(req.params.id));
    if (control) {
      control.aborted = true;
      try { control.controller.abort(); } catch (e) { /* 已结束则忽略 */ }
    }
    const task = await db.get('SELECT image_path FROM ai_grading_tasks WHERE id = ?', [req.params.id]);
    if (task && task.image_path) {
      task.image_path.split(',').map(s => s.trim()).filter(Boolean).forEach(f => {
        // 仅清理本功能新上传（ai- 前缀）的图片；basename 去掉任何目录成分并要求与原值一致、
        // 且不含 ..，防止 image_path 被构造成穿越到 uploads/ 之外造成误删
        const base = path.basename(f);
        if (base === f && base.startsWith('ai-') && !f.includes('..')) {
          const fp = path.join(__dirname, '..', 'uploads', base);
          if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch (e) { /* 忽略 */ } }
        }
      });
    }
    await db.run('DELETE FROM ai_grading_tasks WHERE id = ?', [req.params.id]);
    sendResponse(res, { id: req.params.id });
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

// GET /ai-grading/tasks/:id/export - 导出批改文档（概览 + 逐题明细）
router.get('/ai-grading/tasks/:id/export', async (req, res) => {
  try {
    const db = await getDb();
    const row = await db.get(`
      SELECT t.*, s.name AS student_name, e.title AS exam_title
      FROM ai_grading_tasks t
      LEFT JOIN students s ON t.student_id = s.id
      LEFT JOIN exams e ON t.exam_id = e.id
      WHERE t.id = ?
    `, [req.params.id]);
    if (!row) return sendResponse(res, null, '任务不存在', 404);

    let detail = { questions: [] };
    if (row.detail) { try { detail = JSON.parse(row.detail) || detail; } catch (e) { /* 用默认 */ } }
    const questions = Array.isArray(detail.questions) ? detail.questions : [];

    // AI 自评把握度汇总：让老师一眼看到「有哪些题值得优先复核」。
    // 只在确有把握度数据时展示，模型未返回（如用户自定义了提示词）则如实说明。
    const withConf = questions.filter(q => typeof q.confidence === 'number');
    const lowConfCount = withConf.filter(q => q.confidence < 60).length;
    const confSummary = withConf.length
      ? `平均 ${Math.round(withConf.reduce((s, q) => s + q.confidence, 0) / withConf.length)} 分；把握较低（<60 分）${lowConfCount} 题，建议优先复核`
      : '模型未返回把握度（本次结果请逐题人工核对）';

    const overview = [
      { '项目': '试卷', '内容': row.exam_title || '' },
      { '项目': '学生', '内容': row.student_name || '' },
      { '项目': '批改模型', '内容': row.model || '' },
      { '项目': 'AI 判分', '内容': `${row.total_score ?? ''} / ${row.full_score ?? ''}` },
      { '项目': 'AI 把握度', '内容': confSummary },
      { '项目': '采纳状态', '内容': row.adopted ? '已采纳' : '未采纳' },
      { '项目': '批改时间', '内容': row.updated_at || row.created_at || '' },
      { '项目': '总评', '内容': row.comment || '' }
    ];
    const qdata = questions.map(q => ({
      '题号': q.no, '题目': q.question, '学生作答': q.student_answer,
      '得分': q.score, '满分': q.full_score, '判定': resultLabel(q.result),
      'AI把握度': typeof q.confidence === 'number' ? q.confidence : '',
      '点评': q.comment
    }));

    const wb = xlsx.utils.book_new();
    const ws1 = xlsx.utils.json_to_sheet(overview);
    ws1['!cols'] = [{ wch: 12 }, { wch: 70 }];
    const ws2 = xlsx.utils.json_to_sheet(qdata);
    ws2['!cols'] = [{ wch: 8 }, { wch: 32 }, { wch: 32 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 40 }];
    xlsx.utils.book_append_sheet(wb, ws1, '批改概览');
    xlsx.utils.book_append_sheet(wb, ws2, '逐题明细');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', contentDisposition(`${row.exam_title || '试卷'}_${row.student_name || '学生'}_AI批改.xlsx`));
    res.send(xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  } catch (err) {
    sendResponse(res, null, err.message, 500);
  }
});

module.exports = router;
