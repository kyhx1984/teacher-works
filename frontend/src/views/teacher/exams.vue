<template>
  <div class="exams-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索试卷标题"
            style="width: 250px"
            clearable
            @input="filterExams"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
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
        <el-table-column label="关联资源" width="150">
          <template #default="scope">
            <el-tag v-if="scope.row.resource_title" type="info" size="small">
              {{ scope.row.resource_title }}
            </el-tag>
            <span v-else class="text-muted">未关联</span>
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
        <el-form-item label="关联资源">
          <el-select v-model="form.resource_id" placeholder="选择资源文件（可选）" clearable style="width: 100%">
            <el-option 
              v-for="r in resources" 
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
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="editRecord(scope.row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 编辑考试记录对话框 -->
    <el-dialog v-model="recordDialogVisible" title="编辑考试记录" width="500px">
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
  getResources,
  getExamRecords, createExamRecord, updateExamRecord,
  exportExamTemplate, importExamRecords
} from '../../api'

const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const dialogVisible = ref(false)
const previewVisible = ref(false)
const allExams = ref([])
const filtered = ref([])
const previewData = ref({})
const previewContent = ref('')
const resources = ref([])

// 考试记录相关
const recordsVisible = ref(false)
const recordsLoading = ref(false)
const currentExam = ref({})
const examRecords = ref([])

// 编辑记录对话框
const recordDialogVisible = ref(false)
const recordSaving = ref(false)
const recordForm = ref({ id: null, student_id: null, student_name: '', score: null, comment: '', remark: '' })

// 导入相关
const importVisible = ref(false)
const importing = ref(false)
const importUploadRef = ref()
const importFile = ref(null)
const importExamId = ref(null)

const form = ref({ id: null, title: '', type: '', content: '', resource_id: null })

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
  form.value = { id: null, title: '', type: '', content: '', resource_id: null }
  dialogVisible.value = true
}

const loadExams = async () => {
  loading.value = true
  try {
    allExams.value = await getExams()
    filterExams()
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
      content: form.value.content,
      resource_id: form.value.resource_id
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

// 生成学生考试记录
const generateRecords = async (exam) => {
  try {
    await createExamRecord({ exam_id: exam.id })
    ElMessage.success('已为所有学生生成考试记录')
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
  recordDialogVisible.value = true
}

const handleSaveRecord = async () => {
  recordSaving.value = true
  try {
    await updateExamRecord(recordForm.value.id, {
      score: recordForm.value.score,
      comment: recordForm.value.comment,
      remark: recordForm.value.remark
    })
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
  loadResources()
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
</style>
