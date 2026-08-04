<template>
  <div class="communications-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索学生或内容"
            style="width: 250px"
            clearable
            @input="filterList"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
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
              <el-icon><Plus /></el-icon>登记沟通
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="pagedData" style="width: 100%" v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="date" label="日期" width="120" />
        <el-table-column prop="method" label="方式" width="100">
          <template #default="scope">
            <el-tag>{{ scope.row.method }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="沟通内容" show-overflow-tooltip />
        <el-table-column prop="feedback" label="家长反馈" show-overflow-tooltip />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="scope">
            <el-popconfirm title="确定删除该沟通记录吗？" @confirm="handleDelete(scope.row.id)">
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

    <el-dialog v-model="dialogVisible" title="登记沟通记录" width="560px">
      <el-form ref="formRef" :model="form" :rules="communicationRules" label-width="90px">
        <el-form-item label="学生" prop="student_id" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期" prop="date">
          <el-date-picker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="沟通方式" prop="method">
          <el-select v-model="form.method" style="width: 100%">
            <el-option label="电话" value="电话" />
            <el-option label="微信" value="微信" />
            <el-option label="QQ" value="QQ" />
            <el-option label="家访" value="家访" />
            <el-option label="到校面谈" value="到校面谈" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="沟通内容" prop="content">
          <el-input type="textarea" :rows="3" v-model="form.content" placeholder="沟通的主要内容" />
        </el-form-item>
        <el-form-item label="家长反馈">
          <el-input type="textarea" :rows="3" v-model="form.feedback" placeholder="家长的反馈意见" />
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
import {
  getCommunications,
  createCommunication,
  deleteCommunication,
  batchDeleteCommunications,
  getStudents
} from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const searchQuery = ref('')
const allList = ref([])
const filtered = ref([])
const students = ref([])
const formRef = ref()

const form = ref({ student_id: null, date: '', method: '电话', content: '', feedback: '' })

// 沟通表单校验规则
const communicationRules = {
  student_id: [{ required: true, message: '请选择学生', trigger: 'change' }],
  date: [{ required: true, message: '请选择日期', trigger: 'change' }],
  method: [{ required: true, message: '请选择沟通方式', trigger: 'change' }],
  content: [{ required: true, message: '请输入沟通内容', trigger: 'blur' }]
}

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

const filterList = () => {
  if (!searchQuery.value) {
    filtered.value = allList.value
  } else {
    const q = searchQuery.value
    filtered.value = allList.value.filter(
      (c) =>
        (c.student_name || '').includes(q) ||
        (c.content || '').includes(q) ||
        (c.feedback || '').includes(q)
    )
  }
  // 搜索后重置到第一页
  currentPage.value = 1
}

const openCreate = () => {
  const today = new Date().toISOString().slice(0, 10)
  form.value = { student_id: null, date: today, method: '电话', content: '', feedback: '' }
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const loadData = async () => {
  loading.value = true
  try {
    const [commRows, studentRows] = await Promise.all([getCommunications(), getStudents()])
    allList.value = commRows
    students.value = studentRows
    filterList()
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
    await createCommunication({ ...form.value })
    ElMessage.success('登记成功')
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
    await deleteCommunication(id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

// 批量删除沟通记录
const handleBatchDelete = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${selectedRows.value.length} 条沟通记录？`,
      '提示',
      { type: 'warning' }
    )
  } catch (e) {
    // 用户取消
    return
  }
  try {
    const ids = selectedRows.value.map((r) => r.id)
    await batchDeleteCommunications(ids)
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
</style>