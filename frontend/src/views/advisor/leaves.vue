<template>
  <div class="leaves-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 150px" @change="resetPage">
            <el-option label="登记" value="登记" />
            <el-option label="已销假" value="已销假" />
          </el-select>
          <div class="action-buttons">
            <el-button
              v-if="selectedRows.length"
              type="success"
              plain
              @click="handleBatchSellOff"
            >
              <el-icon><Check /></el-icon>批量销假（{{ selectedRows.length }}）
            </el-button>
            <el-button
              v-if="selectedRows.length"
              type="danger"
              plain
              @click="handleBatchDelete"
            >
              <el-icon><Delete /></el-icon>批量删除（{{ selectedRows.length }}）
            </el-button>
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>登记请假
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="pagedData" style="width: 100%" v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="start_date" label="开始日期" width="120" />
        <el-table-column prop="end_date" label="结束日期" width="120" />
        <el-table-column prop="reason" label="请假事由" show-overflow-tooltip />
        <el-table-column label="附件" width="90" align="center">
          <template #default="scope">
            <el-image
              v-if="scope.row.image_path"
              :src="`/uploads/${scope.row.image_path}`"
              :preview-src-list="previewList(scope.row.image_path)"
              :preview-teleported="true"
              fit="cover"
              style="width: 50px; height: 50px; border-radius: 4px"
              :z-index="3000"
            />
            <span v-else class="no-attach">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" width="150" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === '已销假' ? 'success' : 'warning'">
              {{ scope.row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
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

      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="filtered.length"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end;"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记请假" width="500px">
      <el-form ref="formRef" :model="form" :rules="leaveRules" label-width="90px">
        <el-form-item label="学生" prop="student_id" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始日期" prop="start_date">
          <el-date-picker
            v-model="form.start_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择开始日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束日期" prop="end_date">
          <el-date-picker
            v-model="form.end_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择结束日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="请假事由" prop="reason">
          <el-input v-model="form.reason" placeholder="请填写请假原因" />
        </el-form-item>
        <el-form-item label="请假条照片">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept="image/*"
            :on-change="onImageChange"
            :on-exceed="onExceed"
            :on-remove="onImageRemove"
          >
            <el-button type="primary" plain>
              <el-icon><Upload /></el-icon>选择图片
            </el-button>
            <template #tip>
              <div class="el-upload__tip">支持上传一张请假条照片（JPG/PNG 等）</div>
            </template>
          </el-upload>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            placeholder="可选，如：补交材料说明等"
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
import { ref, computed, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getLeaves,
  createLeave,
  changeLeaveStatus,
  deleteLeave,
  batchUpdateLeaveStatus,
  batchDeleteLeaves,
  getStudents
} from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const filterStatus = ref(null)
const leaves = ref([])
const students = ref([])
const uploadRef = ref()
const formRef = ref()
// 用户选择的图片文件
const imageFile = ref(null)

const form = ref({ student_id: null, start_date: '', end_date: '', reason: '', remark: '' })

// 请假表单校验规则
const leaveRules = {
  student_id: [{ required: true, message: '请选择学生', trigger: 'change' }],
  start_date: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  end_date: [{ required: true, message: '请选择结束日期', trigger: 'change' }],
  reason: [{ required: true, message: '请输入请假原因', trigger: 'blur' }]
}

const filtered = computed(() => {
  if (!filterStatus.value) return leaves.value
  return leaves.value.filter((l) => l.status === filterStatus.value)
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

// 缩略图预览列表（el-image 的 preview-src-list 需要数组）
const previewList = (imagePath) => [`/uploads/${imagePath}`]

const openCreate = () => {
  form.value = { student_id: null, start_date: '', end_date: '', reason: '', remark: '' }
  imageFile.value = null
  if (uploadRef.value) uploadRef.value.clearFiles()
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const openEdit = (row) => {
  form.value = { 
    id: row.id,
    student_id: row.student_id, 
    start_date: row.start_date, 
    end_date: row.end_date, 
    reason: row.reason,
    remark: row.remark || ''
  }
  imageFile.value = null
  if (uploadRef.value) uploadRef.value.clearFiles()
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const loadData = async () => {
  loading.value = true
  try {
    const [leaveRows, studentRows] = await Promise.all([getLeaves(), getStudents()])
    leaves.value = leaveRows
    students.value = studentRows
    // 数据加载完成后重置分页
    currentPage.value = 1
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 选择图片时保存引用
const onImageChange = (file) => {
  imageFile.value = file.raw
}

// 超出限制时提示
const onExceed = () => {
  ElMessage.warning('最多只能上传一张请假条照片')
}

// 删除图片时清空引用
const onImageRemove = () => {
  imageFile.value = null
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
    // 使用 FormData 提交，便于后端接收图片文件
    const fd = new FormData()
    fd.append('student_id', form.value.student_id)
    fd.append('start_date', form.value.start_date)
    fd.append('end_date', form.value.end_date)
    fd.append('reason', form.value.reason)
    if (form.value.remark) {
      fd.append('remark', form.value.remark)
    }
    if (imageFile.value) {
      fd.append('image', imageFile.value)
    }
    
    if (form.value.id) {
      // 编辑模式
      await updateLeave(form.value.id, fd)
      ElMessage.success('更新成功')
    } else {
      // 创建模式
      await createLeave(fd)
      ElMessage.success('登记成功')
    }
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

// 批量销假
const handleBatchSellOff = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将选中的 ${selectedRows.value.length} 条请假记录标记为已销假？`,
      '提示',
      { type: 'warning' }
    )
  } catch (e) {
    // 用户取消
    return
  }
  try {
    const ids = selectedRows.value.map((r) => r.id)
    await batchUpdateLeaveStatus(ids, '已销假')
    ElMessage.success('批量销假成功')
    selectedRows.value = []
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

// 批量删除请假记录
const handleBatchDelete = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${selectedRows.value.length} 条请假记录？`,
      '提示',
      { type: 'warning' }
    )
  } catch (e) {
    // 用户取消
    return
  }
  try {
    const ids = selectedRows.value.map((r) => r.id)
    await batchDeleteLeaves(ids)
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
.no-attach {
  color: #c0c4cc;
}
</style>
