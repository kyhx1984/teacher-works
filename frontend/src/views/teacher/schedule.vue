<template>
  <div class="schedule-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div>
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>添加课程
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="scheduleData" style="width: 100%" v-loading="loading">
        <el-table-column prop="week_day" label="星期" width="100">
          <template #default="scope">
            {{ weekDays[scope.row.week_day] }}
          </template>
        </el-table-column>
        <el-table-column prop="period" label="节次" width="100">
          <template #default="scope">
            第{{ scope.row.period }}节
          </template>
        </el-table-column>
        <el-table-column prop="subject" label="科目" width="120">
          <template #default="scope">
            <el-tag :color="scope.row.color || '#409eff'" effect="dark">
              {{ scope.row.subject }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="teacher" label="教师" width="120" />
        <el-table-column prop="room" label="教室" width="120" />
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除该课程吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑课程' : '添加课程'" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="星期" prop="week_day">
          <el-select v-model="form.week_day" placeholder="请选择" style="width: 100%">
            <el-option v-for="(day, index) in weekDays" :key="index" :label="day" :value="index" />
          </el-select>
        </el-form-item>
        <el-form-item label="节次" prop="period">
          <el-input-number v-model="form.period" :min="1" :max="10" style="width: 100%" />
        </el-form-item>
        <el-form-item label="科目" prop="subject">
          <el-input v-model="form.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="教师">
          <el-input v-model="form.teacher" placeholder="任课教师" />
        </el-form-item>
        <el-form-item label="教室">
          <el-input v-model="form.room" placeholder="上课教室" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            placeholder="可选，如：调课说明等"
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSchedule, saveSchedule, deleteSchedule } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const scheduleData = ref([])
const formRef = ref()

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const form = ref({
  id: null,
  week_day: 0,
  period: 1,
  subject: '',
  teacher: '',
  room: '',
  color: '#409eff',
  remark: ''
})

const rules = {
  week_day: [{ required: true, message: '请选择星期', trigger: 'change' }],
  period: [{ required: true, message: '请输入节次', trigger: 'blur' }],
  subject: [{ required: true, message: '请输入科目', trigger: 'blur' }]
}

const loadData = async () => {
  loading.value = true
  try {
    scheduleData.value = await getSchedule()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  form.value = {
    id: null,
    week_day: 0,
    period: 1,
    subject: '',
    teacher: '',
    room: '',
    color: '#409eff',
    remark: ''
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
    await saveSchedule(form.value)
    ElMessage.success(form.value.id ? '更新成功' : '添加成功')
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  try {
    await deleteSchedule(id)
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
</style>
