<template>
  <div class="tasks-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="filter-group">
            <el-select v-model="filterStatus" placeholder="状态筛选" clearable style="width: 120px; margin-right: 10px;">
              <el-option label="待处理" value="pending" />
              <el-option label="进行中" value="in_progress" />
              <el-option label="已完成" value="completed" />
            </el-select>
            <el-select v-model="filterPriority" placeholder="优先级筛选" clearable style="width: 120px;">
              <el-option label="高" value="high" />
              <el-option label="中" value="medium" />
              <el-option label="低" value="low" />
            </el-select>
          </div>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>添加任务
          </el-button>
        </div>
      </template>

      <el-table :data="filteredTasks" style="width: 100%" v-loading="loading">
        <el-table-column prop="title" label="任务标题" min-width="200" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="100">
          <template #default="scope">
            <el-tag :type="getPriorityType(scope.row.priority)">
              {{ getPriorityText(scope.row.priority) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="due_date" label="截止日期" width="120">
          <template #default="scope">
            <span :class="{ 'overdue': isOverdue(scope.row) }">
              {{ scope.row.due_date || '-' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="任务描述" min-width="200" show-overflow-tooltip />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button 
              v-if="scope.row.status !== 'completed'" 
              link 
              type="success" 
              size="small"
              @click="handleComplete(scope.row)"
            >
              完成
            </el-button>
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除该任务吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑任务' : '添加任务'" width="600px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="任务标题" prop="title">
          <el-input v-model="form.title" placeholder="请输入任务标题" />
        </el-form-item>
        <el-form-item label="优先级" prop="priority">
          <el-select v-model="form.priority" placeholder="请选择" style="width: 100%">
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" placeholder="请选择" style="width: 100%">
            <el-option label="待处理" value="pending" />
            <el-option label="进行中" value="in_progress" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="截止日期" prop="due_date">
          <el-date-picker
            v-model="form.due_date"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="任务描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="请输入任务描述"
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getTasks, createTask, updateTask, deleteTask, completeTask } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const tasks = ref([])
const formRef = ref()
const filterStatus = ref('')
const filterPriority = ref('')

const form = ref({
  id: null,
  title: '',
  priority: 'medium',
  status: 'pending',
  due_date: '',
  description: ''
})

const rules = {
  title: [{ required: true, message: '请输入任务标题', trigger: 'blur' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
}

const filteredTasks = computed(() => {
  return tasks.value.filter(task => {
    if (filterStatus.value && task.status !== filterStatus.value) return false
    if (filterPriority.value && task.priority !== filterPriority.value) return false
    return true
  })
})

const getPriorityType = (priority) => {
  const map = { high: 'danger', medium: 'warning', low: 'info' }
  return map[priority] || 'info'
}

const getPriorityText = (priority) => {
  const map = { high: '高', medium: '中', low: '低' }
  return map[priority] || '中'
}

const getStatusType = (status) => {
  const map = { pending: 'info', in_progress: 'warning', completed: 'success' }
  return map[status] || 'info'
}

const getStatusText = (status) => {
  const map = { pending: '待处理', in_progress: '进行中', completed: '已完成' }
  return map[status] || '待处理'
}

const isOverdue = (task) => {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

const loadData = async () => {
  loading.value = true
  try {
    tasks.value = await getTasks()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.value = {
    id: null,
    title: '',
    priority: 'medium',
    status: 'pending',
    due_date: '',
    description: ''
  }
  dialogVisible.value = true
}

const openEdit = (row) => {
  form.value = { ...row }
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }
  saving.value = true
  try {
    if (form.value.id) {
      await updateTask(form.value.id, form.value)
      ElMessage.success('更新成功')
    } else {
      await createTask(form.value)
      ElMessage.success('添加成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

const handleComplete = async (row) => {
  try {
    await completeTask(row.id)
    ElMessage.success('任务已完成')
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

const handleDelete = async (id) => {
  try {
    await deleteTask(id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

onMounted(loadData)
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-group {
  display: flex;
  align-items: center;
}
.overdue {
  color: #f56c6c;
  font-weight: bold;
}
</style>
