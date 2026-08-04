<template>
  <div class="points-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-select v-model="filterStudent" placeholder="按学生筛选" clearable filterable style="width: 200px" @change="resetPage">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <div class="action-buttons">
            <el-button
              v-if="selectedRows.length"
              type="danger"
              plain
              @click="handleBatchDelete"
            >
              <el-icon><Delete /></el-icon>批量删除（{{ selectedRows.length }}）
            </el-button>
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>录入积分
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="pagedData" style="width: 100%" v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
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

      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="filtered.length"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end;"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" title="录入积分" width="500px">
      <el-form ref="formRef" :model="form" :rules="pointRules" label-width="80px">
        <el-form-item label="学生" prop="student_id" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="事由" prop="reason">
          <el-input v-model="form.reason" placeholder="例如：课堂表现优秀" />
        </el-form-item>
        <el-form-item label="积分值" prop="points">
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
import { ref, computed, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPoints, createPoint, deletePoint, batchDeletePoints, getStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const filterStudent = ref(null)
const points = ref([])
const students = ref([])
const formRef = ref()

const form = ref({ student_id: null, reason: '', points: 2 })

// 积分表单校验规则
const pointRules = {
  student_id: [{ required: true, message: '请选择学生', trigger: 'change' }],
  reason: [{ required: true, message: '请输入事由', trigger: 'blur' }],
  points: [{ required: true, message: '请输入积分', trigger: 'blur' }]
}

const filtered = computed(() => {
  if (!filterStudent.value) return points.value
  return points.value.filter((p) => p.student_id === filterStudent.value)
})

// 批量操作：选中行
const selectedRows = ref([])
const handleSelectionChange = (val) => { selectedRows.value = val }

// 分页：当前页与每页条数（基于过滤后的数据切片）
const currentPage = ref(1)
const pageSize = ref(20)
const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// 筛选变化时重置到第一页
const resetPage = () => { currentPage.value = 1 }

const openCreate = () => {
  form.value = { student_id: null, reason: '', points: 2 }
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const loadData = async () => {
  loading.value = true
  try {
    const [pointRows, studentRows] = await Promise.all([getPoints(), getStudents()])
    points.value = pointRows
    students.value = studentRows
    // 数据加载完成后重置分页
    currentPage.value = 1
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!formRef.value) return
  try {
    // 校验通过再提交，失败时不弹 ElMessage（Element Plus 自动标红）
    await formRef.value.validate()
  } catch (e) {
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

// 批量删除积分记录
const handleBatchDelete = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${selectedRows.value.length} 条积分记录？`,
      '提示',
      { type: 'warning' }
    )
  } catch (e) {
    // 用户取消
    return
  }
  try {
    const ids = selectedRows.value.map((r) => r.id)
    await batchDeletePoints(ids)
    ElMessage.success('批量删除成功')
    selectedRows.value = []
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
.action-buttons {
  display: flex;
  gap: 10px;
}
.tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>