<template>
  <div class="points-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-select v-model="filterStudent" placeholder="按学生筛选" clearable filterable style="width: 200px">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>录入积分
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="reason" label="事由" show-overflow-tooltip />
        <el-table-column prop="points" label="积分" width="110" align="center">
          <template #default="scope">
            <el-tag :type="scope.row.points >= 0 ? 'success' : 'danger'">
              {{ scope.row.points > 0 ? '+' : '' }}{{ scope.row.points }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="时间" width="180" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-popconfirm title="确定删除该条积分记录吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="录入积分" width="500px">
      <el-form label-width="80px">
        <el-form-item label="学生" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事由">
          <el-input v-model="form.reason" placeholder="例如：课堂表现优秀" />
        </el-form-item>
        <el-form-item label="积分值">
          <el-input-number v-model="form.points" :min="-100" :max="100" />
          <span class="tip">正数加分，负数扣分</span>
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
import { getPoints, createPoint, deletePoint, getStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const filterStudent = ref(null)
const points = ref([])
const students = ref([])

const form = ref({ student_id: null, reason: '', points: 2 })

const filtered = computed(() => {
  if (!filterStudent.value) return points.value
  return points.value.filter((p) => p.student_id === filterStudent.value)
})

const openCreate = () => {
  form.value = { student_id: null, reason: '', points: 2 }
  dialogVisible.value = true
}

const loadData = async () => {
  loading.value = true
  try {
    const [pointRows, studentRows] = await Promise.all([getPoints(), getStudents()])
    points.value = pointRows
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
    await createPoint({ student_id: form.value.student_id, reason: form.value.reason, points: form.value.points })
    ElMessage.success('录入成功')
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
    await deletePoint(id)
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
.tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>