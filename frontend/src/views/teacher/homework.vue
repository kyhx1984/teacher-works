<template>
  <div class="homework-container">
    <!-- 第一级：作业任务列表 -->
    <el-card shadow="never" v-if="!selectedTask">
      <template #header>
        <div class="header-actions">
          <div class="filters">
            <el-input
              v-model="searchQuery"
              placeholder="搜索任务标题或科目"
              style="width: 250px"
              clearable
              @input="filterTasks"
            />
          </div>
          <el-button type="primary" @click="openCreateTask">
            <el-icon><Plus /></el-icon>新增作业任务
          </el-button>
        </div>
      </template>

      <el-table :data="filteredTasks" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="任务标题" show-overflow-tooltip />
        <el-table-column prop="subject" label="科目" width="100" />
        <el-table-column prop="homework_date" label="作业日期" width="120" />
        <el-table-column label="完成进度" width="150">
          <template #default="scope">
            <el-progress 
              :percentage="getProgress(scope.row)" 
              :format="() => `${scope.row.completed_students}/${scope.row.total_students}`"
            />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="viewTaskDetail(scope.row)">
              查看详情
            </el-button>
            <el-button link type="success" size="small" @click="exportTask(scope.row.id)">
              导出Excel
            </el-button>
            <el-button link type="warning" size="small" @click="openEditTask(scope.row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除该任务吗？" @confirm="handleDeleteTask(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 第二级：任务详情（学生作业情况） -->
    <el-card shadow="never" v-else>
      <template #header>
        <div class="header-actions">
          <div class="task-info">
            <el-button @click="backToTasks">
              <el-icon><ArrowLeft /></el-icon>返回任务列表
            </el-button>
            <div class="task-detail">
              <h3>{{ selectedTask.title }}</h3>
              <el-tag>{{ selectedTask.subject }}</el-tag>
              <span class="task-meta">日期：{{ selectedTask.homework_date }}</span>
              <span class="task-meta">完成：{{ selectedTask.completed_students }}/{{ selectedTask.total_students }}</span>
            </div>
          </div>
          <div class="action-buttons">
            <el-button type="primary" @click="openAddStudents">
              <el-icon><Plus /></el-icon>添加学生
            </el-button>
            <el-button type="success" @click="exportTask(selectedTask.id)">
              <el-icon><Download /></el-icon>导出Excel
            </el-button>
          </div>
        </div>
      </template>

      <!-- 任务内容预览 -->
      <div v-if="selectedTask.content" class="task-content">
        <el-alert
          :title="selectedTask.content"
          type="info"
          :closable="false"
          show-icon
        />
      </div>

      <el-table :data="taskRecords" style="width: 100%" v-loading="recordsLoading">
        <el-table-column prop="student_name" label="学生姓名" width="120" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
              {{ scope.row.status === 1 ? '已完成' : '未完成' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="成绩" width="100">
          <template #default="scope">
            {{ scope.row.score || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="completed_at" label="完成时间" width="180">
          <template #default="scope">
            {{ scope.row.completed_at ? formatTime(scope.row.completed_at) : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 0"
              link
              type="success"
              size="small"
              @click="toggleRecordStatus(scope.row)"
            >
              标记完成
            </el-button>
            <el-button
              v-else
              link
              type="warning"
              size="small"
              @click="toggleRecordStatus(scope.row)"
            >
              撤销完成
            </el-button>
            <el-button link type="primary" size="small" @click="openEditRecord(scope.row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除该记录吗？" @confirm="handleDeleteRecord(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑任务对话框 -->
    <el-dialog v-model="taskDialogVisible" :title="editingTask ? '编辑作业任务' : '新增作业任务'" width="600px">
      <el-form ref="taskFormRef" :model="taskForm" :rules="taskRules" label-width="100px">
        <el-form-item label="任务标题" prop="title">
          <el-input v-model="taskForm.title" placeholder="例如：第三单元练习题" />
        </el-form-item>
        <el-form-item label="科目" prop="subject">
          <el-input v-model="taskForm.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="作业日期" prop="homework_date">
          <el-date-picker
            v-model="taskForm.homework_date"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="作业内容">
          <el-input 
            v-model="taskForm.content" 
            type="textarea" 
            :rows="3"
            placeholder="可选，描述作业要求等"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="taskForm.remark" 
            type="textarea" 
            :rows="2"
            placeholder="可选，如：截止时间、特殊要求等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="taskDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSaveTask">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 添加学生对话框 -->
    <el-dialog v-model="addStudentsDialogVisible" title="添加学生到任务" width="500px">
      <el-form label-width="100px">
        <el-form-item label="选择学生">
          <el-select
            v-model="selectedStudentIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择学生（可多选）"
            style="width: 100%"
          >
            <el-option
              v-for="s in availableStudents"
              :key="s.id"
              :label="`${s.name}（${s.id}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addStudentsDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="addingStudents" @click="handleAddStudents">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑记录对话框 -->
    <el-dialog v-model="editRecordDialogVisible" title="编辑作业记录" width="500px">
      <el-form label-width="100px">
        <el-form-item label="学生">
          <el-input :value="editingRecord?.student_name" disabled />
        </el-form-item>
        <el-form-item label="成绩">
          <el-input-number 
            v-model="editingRecordScore" 
            :min="0" 
            :max="100" 
            :precision="1"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input 
            v-model="editingRecordRemark" 
            type="textarea" 
            :rows="3"
            placeholder="可选，如：作业质量、完成情况等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editRecordDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingRecord" @click="handleSaveRecord">确定</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getHomeworkTasks,
  createHomeworkTask,
  updateHomeworkTask,
  deleteHomeworkTask,
  getHomeworkRecords,
  createHomeworkRecords,
  updateHomeworkRecord,
  deleteHomeworkRecord,
  exportHomeworkTask,
  getStudents
} from '../../api'

// 第一级：任务列表
const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const allTasks = ref([])
const filteredTasks = ref([])
const taskDialogVisible = ref(false)
const editingTask = ref(null)
const taskFormRef = ref()

const taskForm = ref({
  title: '',
  subject: '语文',
  content: '',
  homework_date: '',
  remark: ''
})

const taskRules = {
  title: [{ required: true, message: '请输入任务标题', trigger: 'blur' }],
  subject: [{ required: true, message: '请输入科目', trigger: 'blur' }],
  homework_date: [{ required: true, message: '请选择作业日期', trigger: 'change' }]
}

// 第二级：任务详情
const selectedTask = ref(null)
const recordsLoading = ref(false)
const taskRecords = ref([])
const students = ref([])
const addStudentsDialogVisible = ref(false)
const addingStudents = ref(false)
const selectedStudentIds = ref([])
const editRecordDialogVisible = ref(false)
const savingRecord = ref(false)
const editingRecord = ref(null)
const editingRecordScore = ref(null)
const editingRecordRemark = ref('')

// 计算进度百分比
const getProgress = (task) => {
  if (task.total_students === 0) return 0
  return Math.round((task.completed_students / task.total_students) * 100)
}

// 格式化时间
const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

// 过滤任务
const filterTasks = () => {
  if (!searchQuery.value) {
    filteredTasks.value = allTasks.value
  } else {
    filteredTasks.value = allTasks.value.filter((task) => {
      const matchTitle = (task.title || '').includes(searchQuery.value)
      const matchSubject = (task.subject || '').includes(searchQuery.value)
      return matchTitle || matchSubject
    })
  }
}

// 加载任务列表
const loadTasks = async () => {
  loading.value = true
  try {
    allTasks.value = await getHomeworkTasks()
    filterTasks()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 打开创建任务对话框
const openCreateTask = () => {
  editingTask.value = null
  taskForm.value = { title: '', subject: '语文', content: '', homework_date: '', remark: '' }
  taskDialogVisible.value = true
}

// 打开编辑任务对话框
const openEditTask = (task) => {
  editingTask.value = task
  taskForm.value = {
    title: task.title,
    subject: task.subject,
    content: task.content || '',
    homework_date: task.homework_date || '',
    remark: task.remark || ''
  }
  taskDialogVisible.value = true
}

// 保存任务
const handleSaveTask = async () => {
  if (!taskFormRef.value) return
  try {
    await taskFormRef.value.validate()
  } catch (e) {
    return
  }
  saving.value = true
  try {
    if (editingTask.value) {
      await updateHomeworkTask(editingTask.value.id, taskForm.value)
      ElMessage.success('更新成功')
    } else {
      await createHomeworkTask(taskForm.value)
      ElMessage.success('创建成功')
    }
    taskDialogVisible.value = false
    loadTasks()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 删除任务
const handleDeleteTask = async (id) => {
  try {
    await deleteHomeworkTask(id)
    ElMessage.success('删除成功')
    loadTasks()
  } catch (e) {
    // 拦截器已提示
  }
}

// 查看任务详情
const viewTaskDetail = async (task) => {
  selectedTask.value = task
  recordsLoading.value = true
  try {
    const [records, studentRows] = await Promise.all([
      getHomeworkRecords(task.id),
      getStudents()
    ])
    taskRecords.value = records
    students.value = studentRows
  } catch (e) {
    // 拦截器已提示
  } finally {
    recordsLoading.value = false
  }
}

// 返回任务列表
const backToTasks = () => {
  selectedTask.value = null
  taskRecords.value = []
}

// 获取可用学生（未在任务中的）
const availableStudents = computed(() => {
  const existingIds = new Set(taskRecords.value.map(r => r.student_id))
  return students.value.filter(s => !existingIds.has(s.id))
})

// 打开添加学生对话框
const openAddStudents = () => {
  selectedStudentIds.value = []
  addStudentsDialogVisible.value = true
}

// 添加学生到任务
const handleAddStudents = async () => {
  if (selectedStudentIds.value.length === 0) {
    ElMessage.warning('请选择学生')
    return
  }
  addingStudents.value = true
  try {
    await createHomeworkRecords(selectedTask.value.id, {
      student_ids: selectedStudentIds.value
    })
    ElMessage.success(`已添加 ${selectedStudentIds.value.length} 名学生`)
    addStudentsDialogVisible.value = false
    viewTaskDetail(selectedTask.value)
  } catch (e) {
    // 拦截器已提示
  } finally {
    addingStudents.value = false
  }
}

// 切换记录状态
const toggleRecordStatus = async (record) => {
  const next = record.status === 1 ? 0 : 1
  try {
    await updateHomeworkRecord(record.id, { 
      status: next, 
      score: record.score,
      remark: record.remark 
    })
    record.status = next
    if (next === 1) {
      record.completed_at = new Date().toISOString()
    } else {
      record.completed_at = null
    }
    ElMessage.success(next === 1 ? '已标记为完成' : '已撤销完成')
    // 更新任务的完成人数
    if (selectedTask.value) {
      if (next === 1) {
        selectedTask.value.completed_students++
      } else {
        selectedTask.value.completed_students--
      }
    }
  } catch (e) {
    // 拦截器已提示
  }
}

// 打开编辑记录对话框
const openEditRecord = (record) => {
  editingRecord.value = record
  editingRecordScore.value = record.score
  editingRecordRemark.value = record.remark || ''
  editRecordDialogVisible.value = true
}

// 保存记录
const handleSaveRecord = async () => {
  savingRecord.value = true
  try {
    await updateHomeworkRecord(editingRecord.value.id, {
      status: editingRecord.value.status,
      score: editingRecordScore.value,
      remark: editingRecordRemark.value
    })
    editingRecord.value.score = editingRecordScore.value
    editingRecord.value.remark = editingRecordRemark.value
    ElMessage.success('更新成功')
    editRecordDialogVisible.value = false
  } catch (e) {
    // 拦截器已提示
  } finally {
    savingRecord.value = false
  }
}

// 删除记录
const handleDeleteRecord = async (id) => {
  try {
    await deleteHomeworkRecord(id)
    ElMessage.success('删除成功')
    viewTaskDetail(selectedTask.value)
  } catch (e) {
    // 拦截器已提示
  }
}

// 导出任务
const exportTask = async (taskId) => {
  try {
    const blob = await exportHomeworkTask(taskId)
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `作业任务_${taskId}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    // 拦截器已提示
  }
}

onMounted(loadTasks)
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filters {
  display: flex;
  align-items: center;
}
.task-info {
  display: flex;
  align-items: center;
  gap: 20px;
}
.task-detail {
  display: flex;
  align-items: center;
  gap: 10px;
}
.task-detail h3 {
  margin: 0;
  font-size: 18px;
}
.task-meta {
  color: #909399;
  font-size: 14px;
}
.action-buttons {
  display: flex;
  gap: 10px;
}
.task-content {
  margin-bottom: 20px;
}
</style>
