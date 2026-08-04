<template>
  <div class="leaves-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 150px">
            <el-option label="登记" value="登记" />
            <el-option label="已销假" value="已销假" />
          </el-select>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>登记请假
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="start_date" label="开始日期" width="140" />
        <el-table-column prop="end_date" label="结束日期" width="140" />
        <el-table-column prop="reason" label="请假事由" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '已销假' ? 'success' : 'warning'">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === '登记'"
              link
              type="success"
              size="small"
              @click="handleSellOff(scope.row)"
            >
              销假
            </el-button>
            <el-popconfirm title="确定删除该请假记录吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记请假" width="500px">
      <el-form label-width="90px">
        <el-form-item label="学生" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期">
          <el-date-picker
            v-model="form.start_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择开始日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期">
          <el-date-picker
            v-model="form.end_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="请假事由">
          <el-input v-model="form.reason" placeholder="请填写请假原因" />
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
import { getLeaves, createLeave, changeLeaveStatus, deleteLeave, getStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const filterStatus = ref(null)
const leaves = ref([])
const students = ref([])

const form = ref({ student_id: null, start_date: '', end_date: '', reason: '' })

const filtered = computed(() => {
  if (!filterStatus.value) return leaves.value
  return leaves.value.filter((l) => l.status === filterStatus.value)
})

const openCreate = () => {
  form.value = { student_id: null, start_date: '', end_date: '', reason: '' }
  dialogVisible.value = true
}

const loadData = async () => {
  loading.value = true
  try {
    const [leaveRows, studentRows] = await Promise.all([getLeaves(), getStudents()])
    leaves.value = leaveRows
    students.value = studentRows
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!form.value.student_id) {
    ElMessage.warning('请选择学生')
    return
  }
  saving.value = true
  try {
    await createLeave({
      student_id: form.value.student_id,
      start_date: form.value.start_date,
      end_date: form.value.end_date,
      reason: form.value.reason
    })
    ElMessage.success('登记成功')
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

const handleSellOff = async (row) => {
  try {
    await changeLeaveStatus(row.id, '已销假')
    ElMessage.success('销假成功')
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

const handleDelete = async (id) => {
  try {
    await deleteLeave(id)
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