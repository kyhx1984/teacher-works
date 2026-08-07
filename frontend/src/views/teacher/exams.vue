<template>
  <div class="exams-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="filters">
            <el-select v-model="filterType" placeholder="试卷类型" clearable style="width: 140px; margin-right: 10px" @change="loadExams">
              <el-option label="单元检测" value="单元检测" />
              <el-option label="专项练习" value="专项练习" />
              <el-option label="期中考试" value="期中考试" />
              <el-option label="期末考试" value="期末考试" />
            </el-select>
            <el-input
              v-model="searchQuery"
              placeholder="模糊搜索试卷标题"
              style="width: 250px"
              clearable
              @input="onSearchInput"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>新增试卷
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="试卷标题" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="130">
          <template #default="scope">
            <el-tag :type="getTypeTag(scope.row.type)">{{ scope.row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subject" label="科目" width="110">
          <template #default="scope">
            <el-tag v-if="scope.row.subject" type="warning" size="small">{{ scope.row.subject }}</el-tag>
            <span v-else class="text-muted">未设置</span>
          </template>
        </el-table-column>
        <el-table-column label="关联资源" width="150">
          <template #default="scope">
            <el-tag v-if="scope.row.resource_title" type="info" size="small">
              {{ scope.row.resource_title }}
            </el-tag>
            <span v-else class="text-muted">未关联</span>
          </template>
        </el-table-column>
        <el-table-column label="加入分析" width="100" align="center">
          <template #default="scope">
            <el-tag
              :type="scope.row.analyze === 1 ? 'success' : 'info'"
              size="small"
              style="cursor: pointer"
              :title="scope.row.analyze === 1 ? '点击取消加入成绩分析' : '点击加入成绩分析'"
              @click="toggleAnalyze(scope.row)"
            >
              {{ scope.row.analyze === 1 ? '已加入' : '未加入' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="320" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="preview(scope.row)">预览</el-button>
            <el-button link type="primary" size="small" @click="viewRecords(scope.row)">记录</el-button>
            <el-button link type="primary" size="small" @click="generateRecords(scope.row)">生成</el-button>
            <el-button link type="success" size="small" @click="exportTemplate(scope.row.id)">模板</el-button>
            <el-button link type="warning" size="small" @click="openImport(scope.row)">导入</el-button>
            <el-button 
              v-if="scope.row.resource_path" 
              link 
              type="info" 
              size="small" 
              @click="downloadResource(scope.row)"
            >下载</el-button>
            <el-popconfirm title="确定删除吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑试卷对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑试卷' : '新增试卷'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="试卷标题">
          <el-input v-model="form.title" placeholder="请输入试卷标题" />
        </el-form-item>
        <el-form-item label="试卷类型">
          <el-select v-model="form.type" placeholder="请选择" style="width: 100%">
            <el-option label="单元检测" value="单元检测" />
            <el-option label="专项练习" value="专项练习" />
            <el-option label="期中考试" value="期中考试" />
            <el-option label="期末考试" value="期末考试" />
          </el-select>
        </el-form-item>
        <el-form-item label="科目">
          <el-select
            v-model="form.subject"
            placeholder="选择或输入科目"
            allow-create
            filterable
            default-first-option
            style="width: 100%"
          >
            <el-option v-for="s in subjectOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <div class="form-tip">科目将同步到成绩分析，如：语文、数学、英语</div>
        </el-form-item>
        <el-form-item label="资源类别">
          <el-select v-model="form.resource_category" placeholder="全部类别" clearable style="width: 100%" @change="onCategoryChange">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联资源">
          <el-select
            v-model="form.resource_id"
            placeholder="输入资源名称模糊搜索"
            clearable
            filterable
            remote
            :remote-method="searchResources"
            :loading="resourceLoading"
            style="width: 100%"
          >
            <el-option
              v-for="r in resourceOptions"
              :key="r.id"
              :label="`${r.title} (${r.type})`"
              :value="r.id"
            />
          </el-select>
          <div class="form-tip">在"资源管理"中上传试卷PDF、Word、图片等文件</div>
        </el-form-item>
        <el-form-item label="题目内容">
          <el-input
            type="textarea"
            :rows="8"
            v-model="form.content"
            placeholder="每行一题，或直接粘贴题目文本"
          />
        </el-form-item>
        <el-form-item label="加入分析">
          <el-switch v-model="form.analyze" :active-value="1" :inactive-value="0" />
          <div class="form-tip" style="margin-left: 8px">开启后可在「成绩分析」中对该考试的成绩进行分析</div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            type="textarea"
            :rows="2"
            v-model="form.remark"
            placeholder="可选，如：考试范围、注意事项等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 试卷预览对话框 -->
    <el-dialog v-model="previewVisible" title="试卷预览" width="700px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="标题">{{ previewData.title }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ previewData.type }}</el-descriptions-item>
        <el-descriptions-item label="科目">
          <span v-if="previewData.subject">{{ previewData.subject }}</span>
          <span v-else class="text-muted">未设置</span>
        </el-descriptions-item>
        <el-descriptions-item label="关联资源">
          <span v-if="previewData.resource_title">{{ previewData.resource_title }}</span>
          <span v-else class="text-muted">未关联</span>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ previewData.created_at }}</el-descriptions-item>
      </el-descriptions>
      <div class="preview-content">
        <pre>{{ previewContent }}</pre>
      </div>
    </el-dialog>

    <!-- 考试记录对话框 -->
    <el-dialog v-model="recordsVisible" title="考试记录" width="900px">
      <div class="records-header">
        <div class="records-info">
          <span class="exam-title">{{ currentExam.title }}</span>
          <el-tag size="small">{{ currentExam.type }}</el-tag>
        </div>
        <div class="records-actions">
          <el-button type="primary" size="small" @click="openAddStudent">
            <el-icon><Plus /></el-icon>添加学生
          </el-button>
          <el-button type="success" size="small" @click="exportTemplate(currentExam.id)">
            <el-icon><Download /></el-icon>导出模板
          </el-button>
          <el-button type="warning" size="small" @click="openImport(currentExam)">
            <el-icon><Upload /></el-icon>导入成绩
          </el-button>
        </div>
      </div>
      
      <el-table :data="examRecords" style="width: 100%" v-loading="recordsLoading" max-height="400">
        <el-table-column prop="student_name" label="学生" width="120" />
        <el-table-column prop="score" label="成绩" width="100">
          <template #default="scope">
            <span :class="scoreClass(scope.row.score)">
              {{ scope.row.score !== null ? scope.row.score : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="评语" show-overflow-tooltip />
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="图片" width="170">
          <template #default="scope">
            <div class="record-images" v-if="getRecordImages(scope.row).length">
              <div class="record-image-item" v-for="(img, imgIndex) in getRecordImages(scope.row)" :key="img">
                <el-image
                  class="record-thumb"
                  :src="`/uploads/${img}`"
                  :preview-src-list="getRecordImages(scope.row).map(i => `/uploads/${i}`)"
                  :initial-index="imgIndex"
                  fit="cover"
                  preview-teleported
                />
                <a class="record-download" :href="`/uploads/${img}`" :download="img" target="_blank" title="下载图片">
                  <el-icon><Download /></el-icon>
                </a>
              </div>
            </div>
            <span v-else class="text-muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="editRecord(scope.row)">编辑</el-button>
            <el-popconfirm title="删除该学生的考试记录？" @confirm="removeRecord(scope.row)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 添加学生到考试记录对话框 -->
    <el-dialog v-model="addStudentVisible" title="添加学生到考试记录" width="420px">
      <el-select v-model="addStudentId" placeholder="选择未记录的学生" filterable style="width: 100%">
        <el-option v-for="s in addStudentOptions" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
      <div class="form-tip" style="margin-top: 8px">仅显示尚未包含在本次考试记录中的学生</div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addStudentVisible = false">取消</el-button>
          <el-button type="primary" :loading="addStudentSaving" @click="handleAddStudent">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑考试记录对话框 -->
    <el-dialog v-model="recordDialogVisible" title="编辑考试记录" width="560px">
      <el-form :model="recordForm" label-width="80px">
        <el-form-item label="学生">
          <el-input :value="recordForm.student_name" disabled />
        </el-form-item>
        <el-form-item label="成绩">
          <el-input-number v-model="recordForm.score" :min="0" :max="100" :precision="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="评语">
          <el-input type="textarea" :rows="3" v-model="recordForm.comment" placeholder="对该学生的评价" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input type="textarea" :rows="2" v-model="recordForm.remark" placeholder="其他备注信息" />
        </el-form-item>
        <el-form-item label="图片">
          <div class="existing-images" v-if="recordImages.length">
            <div class="existing-image" v-for="(img, imgIndex) in recordImages" :key="img">
              <el-image
                class="record-thumb"
                :src="`/uploads/${img}`"
                :preview-src-list="recordImages.map(i => `/uploads/${i}`)"
                :initial-index="imgIndex"
                fit="cover"
                preview-teleported
              />
              <a class="record-download" :href="`/uploads/${img}`" :download="img" target="_blank" title="下载图片">
                <el-icon><Download /></el-icon>
              </a>
              <el-icon class="record-remove" title="删除图片" @click="removeRecordImage(img)"><CircleClose /></el-icon>
            </div>
          </div>
          <el-upload
            ref="recordUploadRef"
            :auto-upload="false"
            :limit="6"
            accept="image/*"
            multiple
            :on-change="onRecordImageChange"
            :on-remove="onRecordImageRemove"
          >
            <el-button type="primary" plain size="small">
              <el-icon><Upload /></el-icon>上传图片
            </el-button>
            <template #tip>
              <div class="el-upload__tip">支持上传答题卡、试卷照片等，可多选，点击缩略图可放大，右上角图标可下载</div>
            </template>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="recordDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="recordSaving" @click="handleSaveRecord">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 导入成绩对话框 -->
    <el-dialog v-model="importVisible" title="导入成绩" width="500px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="请先导出模板，填写成绩后再导入"
        style="margin-bottom: 16px"
      />
      <el-upload
        ref="importUploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        drag
        :on-change="onImportChange"
      >
        <el-icon class="el-icon--upload"><upload-filled /></el-icon>
        <div class="el-upload__text">拖拽 Excel 到此处或 <em>点击选择</em></div>
        <template #tip>
          <div class="el-upload__tip">支持 .xlsx / .xls 格式</div>
        </template>
      </el-upload>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="importVisible = false">取消</el-button>
          <el-button type="primary" :loading="importing" @click="handleImport">开始导入</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getExams, createExam, updateExam, deleteExam,
  getResources, getResourceCategories,
  getExamRecords, createExamRecord, updateExamRecord, deleteExamRecord,
  exportExamTemplate, importExamRecords,
  getStudents
} from '../../api'

const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const filterType = ref('')
const dialogVisible = ref(false)
const previewVisible = ref(false)
const allExams = ref([])
const filtered = ref([])
const previewData = ref({})
const previewContent = ref('')
const resources = ref([])
// 资源类别列表
const categories = ref([])
// 远程搜索相关
const resourceOptions = ref([])
const resourceLoading = ref(false)

// 考试记录相关
const recordsVisible = ref(false)
const recordsLoading = ref(false)
const currentExam = ref({})
const examRecords = ref([])

// 添加学生到考试记录
const addStudentVisible = ref(false)
const addStudentSaving = ref(false)
const addStudentId = ref(null)
const addStudentOptions = ref([])

// 编辑记录对话框
const recordDialogVisible = ref(false)
const recordSaving = ref(false)
const recordForm = ref({ id: null, student_id: null, student_name: '', score: null, comment: '', remark: '' })

// 记录图片相关：recordImages 为已有图片，removedRecordImages 为待删除的已有图片，newRecordImageFiles 为新选择文件
const recordUploadRef = ref()
const recordImages = ref([])
const removedRecordImages = ref([])
const newRecordImageFiles = ref([])

// 将逗号分隔的 image_path 拆分为图片路径列表
const getRecordImages = (row) => {
  if (!row || !row.image_path) return []
  return row.image_path.split(',').filter(Boolean)
}

// 新图片选择
const onRecordImageChange = (file) => {
  newRecordImageFiles.value.push(file.raw)
}

// 新图片移除
const onRecordImageRemove = (file) => {
  newRecordImageFiles.value = newRecordImageFiles.value.filter(f => f !== file.raw)
}

// 删除已有图片（标记为待删除，保存时生效）
const removeRecordImage = (img) => {
  recordImages.value = recordImages.value.filter(i => i !== img)
  removedRecordImages.value.push(img)
}

// 导入相关
const importVisible = ref(false)
const importing = ref(false)
const importUploadRef = ref()
const importFile = ref(null)
const importExamId = ref(null)

const form = ref({ id: null, title: '', type: '', subject: '', content: '', resource_id: null, remark: '', resource_category: null, analyze: 0 })

// 常用科目选项（支持自由输入）
const subjectOptions = ['语文', '数学', '英语', '科学', '道德与法治', '体育', '音乐', '美术']

const getTypeTag = (type) => {
  const map = { 单元检测: 'primary', 专项练习: 'success', 期中考试: 'warning', 期末考试: 'danger' }
  return map[type] || 'info'
}

const filterExams = () => {
  if (!searchQuery.value) {
    filtered.value = allExams.value
  } else {
    filtered.value = allExams.value.filter((e) => e.title.includes(searchQuery.value))
  }
}

const renderContent = (content) => {
  if (!content) return '（空）'
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed)) {
        return parsed.map((q, i) => `${i + 1}. ${q.question || q.title || JSON.stringify(q)}`).join('\n')
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2)
      }
      return content
    } catch (e) {
      return content
    }
  }
  return JSON.stringify(content, null, 2)
}

const preview = (row) => {
  previewData.value = row
  previewContent.value = renderContent(row.content)
  previewVisible.value = true
}

const openCreate = () => {
  form.value = { id: null, title: '', type: '', subject: '', content: '', resource_id: null, remark: '', resource_category: null, analyze: 0 }
  resourceOptions.value = []
  // 打开对话框时加载部分资源供选择
  searchResources('')
  dialogVisible.value = true
}

// 资源远程搜索（支持按类别筛选）
const searchResources = async (query) => {
  resourceLoading.value = true
  try {
    const params = {}
    if (query) params.keyword = query
    if (form.value.resource_category) params.category_id = form.value.resource_category
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `/resources?${queryString}` : '/resources'
    resourceOptions.value = await getResources(url)
  } catch (e) {
    // 拦截器已提示
  } finally {
    resourceLoading.value = false
  }
}

// 类别变化时重新搜索资源
const onCategoryChange = () => {
  form.value.resource_id = null
  searchResources('')
}

// 加载资源类别
const loadCategories = async () => {
  try {
    categories.value = await getResourceCategories()
  } catch (e) {
    // 拦截器已提示
  }
}

// 搜索防抖
let searchTimer = null
const onSearchInput = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadExams()
  }, 300)
}

const loadExams = async () => {
  loading.value = true
  try {
    const params = {}
    if (filterType.value) params.type = filterType.value
    if (searchQuery.value) params.keyword = searchQuery.value
    
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `/exams?${queryString}` : '/exams'
    allExams.value = await getExams(url)
    filtered.value = allExams.value
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const loadResources = async () => {
  try {
    resources.value = await getResources()
  } catch (e) {
    // 拦截器已提示
  }
}

// 删除旧的 loadResources 引用（不再需要加载全部资源到下拉框）

const handleSave = async () => {
  if (!form.value.title) {
    ElMessage.warning('请输入试卷标题')
    return
  }
  saving.value = true
  try {
    const payload = { 
      title: form.value.title, 
      type: form.value.type || '单元检测', 
      subject: form.value.subject || null,
      content: form.value.content,
      resource_id: form.value.resource_id,
      remark: form.value.remark,
      analyze: form.value.analyze
    }
    if (form.value.id) {
      await updateExam(form.value.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createExam(payload)
      ElMessage.success('保存成功')
    }
    dialogVisible.value = false
    loadExams()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 切换试卷是否加入成绩分析
const toggleAnalyze = async (row) => {
  const next = row.analyze === 1 ? 0 : 1
  try {
    await updateExam(row.id, {
      title: row.title,
      type: row.type,
      subject: row.subject || null,
      content: row.content,
      resource_id: row.resource_id,
      remark: row.remark,
      analyze: next
    })
    row.analyze = next
    ElMessage.success(next === 1 ? '已加入成绩分析' : '已取消加入成绩分析')
  } catch (e) {
    // 拦截器已提示
  }
}

// 删除试卷
const handleDelete = async (id) => {
  try {
    await deleteExam(id)
    ElMessage.success('删除成功')
    loadExams()
  } catch (e) {
    // 拦截器已提示
  }
}

// 下载关联资源
const downloadResource = (row) => {
  if (!row.resource_path) return
  const url = `/uploads/${row.resource_path}`
  window.open(url, '_blank')
}

// 生成/补齐学生考试记录（已有记录不重复生成，新学生可随时补齐）
const generateRecords = async (exam) => {
  try {
    const res = await createExamRecord({ exam_id: exam.id })
    ElMessage.success(res && res.inserted ? `已补齐 ${res.inserted} 名学生考试记录` : '所有学生都已包含在考试记录中')
    viewRecords(exam)
  } catch (e) {
    // 拦截器已提示
  }
}

// 查看考试记录
const viewRecords = async (exam) => {
  currentExam.value = exam
  recordsVisible.value = true
  recordsLoading.value = true
  try {
    examRecords.value = await getExamRecords(exam.id)
  } catch (e) {
    // 拦截器已提示
  } finally {
    recordsLoading.value = false
  }
}

// 打开添加学生对话框（仅列出未包含在学生记录中的学生）
const openAddStudent = async () => {
  try {
    const allStudents = await getStudents()
    const recordedIds = new Set(examRecords.value.map(r => r.student_id))
    addStudentOptions.value = allStudents.filter(s => !recordedIds.has(s.id))
    addStudentId.value = null
    if (!addStudentOptions.value.length) {
      ElMessage.info('所有学生都已包含在考试记录中')
      return
    }
    addStudentVisible.value = true
  } catch (e) {
    // 拦截器已提示
  }
}

// 添加单个学生到考试记录
const handleAddStudent = async () => {
  if (!addStudentId.value) {
    ElMessage.warning('请选择学生')
    return
  }
  addStudentSaving.value = true
  try {
    await createExamRecord({ exam_id: currentExam.value.id, student_id: addStudentId.value })
    ElMessage.success('已添加学生')
    addStudentVisible.value = false
    viewRecords(currentExam.value)
  } catch (e) {
    // 拦截器已提示
  } finally {
    addStudentSaving.value = false
  }
}

// 删除单条考试记录（同步删除成绩分析中对应成绩）
const removeRecord = async (record) => {
  try {
    await deleteExamRecord(record.id)
    ElMessage.success('已删除考试记录')
    viewRecords(currentExam.value)
  } catch (e) {
    // 拦截器已提示
  }
}

// 编辑考试记录
const editRecord = (record) => {
  recordForm.value = {
    id: record.id,
    student_id: record.student_id,
    student_name: record.student_name,
    score: record.score,
    comment: record.comment || '',
    remark: record.remark || ''
  }
  recordImages.value = getRecordImages(record)
  removedRecordImages.value = []
  newRecordImageFiles.value = []
  if (recordUploadRef.value) recordUploadRef.value.clearFiles()
  recordDialogVisible.value = true
}

const handleSaveRecord = async () => {
  recordSaving.value = true
  try {
    // 有图片变更时使用 FormData 提交，否则保持原有 JSON 提交
    const hasImageChanges = newRecordImageFiles.value.length > 0 || removedRecordImages.value.length > 0
    if (hasImageChanges) {
      const fd = new FormData()
      if (recordForm.value.score !== null && recordForm.value.score !== undefined) {
        fd.append('score', recordForm.value.score)
      }
      fd.append('comment', recordForm.value.comment || '')
      fd.append('remark', recordForm.value.remark || '')
      if (removedRecordImages.value.length) {
        fd.append('remove_images', removedRecordImages.value.join(','))
      }
      newRecordImageFiles.value.forEach(f => fd.append('images', f))
      await updateExamRecord(recordForm.value.id, fd)
    } else {
      await updateExamRecord(recordForm.value.id, {
        score: recordForm.value.score,
        comment: recordForm.value.comment,
        remark: recordForm.value.remark
      })
    }
    ElMessage.success('保存成功')
    recordDialogVisible.value = false
    // 刷新记录列表
    if (currentExam.value.id) {
      examRecords.value = await getExamRecords(currentExam.value.id)
    }
  } catch (e) {
    // 拦截器已提示
  } finally {
    recordSaving.value = false
  }
}

// 导出模板
const exportTemplate = async (examId) => {
  try {
    const blob = await exportExamTemplate(examId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `考试模板_${examId}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('模板已导出')
  } catch (e) {
    // 拦截器已提示
  }
}

// 打开导入对话框
const openImport = (exam) => {
  importExamId.value = exam.id
  importFile.value = null
  importVisible.value = true
}

const onImportChange = (file) => {
  importFile.value = file.raw
}

const handleImport = async () => {
  if (!importFile.value) {
    ElMessage.warning('请先选择文件')
    return
  }
  importing.value = true
  try {
    const formData = new FormData()
    formData.append('file', importFile.value)
    formData.append('exam_id', importExamId.value)
    const result = await importExamRecords(formData)
    ElMessage.success(`导入成功：新增 ${result.imported} 条，更新 ${result.updated} 条`)
    importVisible.value = false
    importUploadRef.value?.clearFiles()
    // 刷新记录列表
    if (currentExam.value.id) {
      examRecords.value = await getExamRecords(currentExam.value.id)
    }
  } catch (e) {
    // 拦截器已提示
  } finally {
    importing.value = false
  }
}

// 成绩样式
const scoreClass = (score) => {
  if (score === null || score === undefined) return ''
  if (score >= 90) return 'score-good'
  if (score >= 80) return 'score-mid'
  if (score >= 60) return 'score-ok'
  return 'score-bad'
}

onMounted(() => {
  loadExams()
  loadCategories()
})
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-content {
  margin-top: 16px;
  max-height: 400px;
  overflow: auto;
  background: #f7f7f5;
  border-radius: 8px;
  padding: 16px;
}

.preview-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  line-height: 1.8;
}
/* 记录图片缩略图 */
.record-images {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.record-image-item,
.existing-image {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}
.record-thumb {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  border: 1px solid #ebeef5;
  cursor: pointer;
}
.record-download {
  position: absolute;
  right: -4px;
  top: -4px;
  width: 18px;
  height: 18px;
  background: #409eff;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
.record-remove {
  position: absolute;
  left: -4px;
  top: -4px;
  width: 18px;
  height: 18px;
  background: #f56c6c;
  color: #fff;
  border-radius: 50%;
  cursor: pointer;
}
.existing-images {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
</style>
