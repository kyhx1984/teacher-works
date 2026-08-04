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
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="preview(scope.row)">预览</el-button>
            <el-popconfirm title="确定删除吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

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

    <el-dialog v-model="previewVisible" title="试卷预览" width="700px">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="标题">{{ previewData.title }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ previewData.type }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ previewData.created_at }}</el-descriptions-item>
      </el-descriptions>
      <div class="preview-content">
        <pre>{{ previewContent }}</pre>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getExams, createExam, deleteExam } from '../../api'

const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const dialogVisible = ref(false)
const previewVisible = ref(false)
const allExams = ref([])
const filtered = ref([])
const previewData = ref({})
const previewContent = ref('')

const form = ref({ id: null, title: '', type: '', content: '' })

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
  form.value = { id: null, title: '', type: '', content: '' }
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

const handleSave = async () => {
  if (!form.value.title) {
    ElMessage.warning('请输入试卷标题')
    return
  }
  saving.value = true
  try {
    await createExam({ title: form.value.title, type: form.value.type || '单元检测', content: form.value.content })
    ElMessage.success('保存成功')
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

onMounted(loadExams)
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
