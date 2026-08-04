<template>
  <div class="students-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索学生姓名"
            style="width: 250px"
            clearable
            @input="filterStudents"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <div class="action-buttons">
            <el-button type="success" plain @click="importVisible = true">
              <el-icon><Download /></el-icon>Excel导入
            </el-button>
            <el-button type="primary" @click="openCreate">
              <el-icon><Plus /></el-icon>新增学生
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="学号" width="80" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="gender" label="性别" width="70" />
        <el-table-column prop="birth" label="出生年月" width="120" />
        <el-table-column prop="parent_name" label="家长姓名" width="100" />
        <el-table-column prop="phone" label="联系电话" width="140" />
        <el-table-column prop="is_special" label="特殊情况" width="100">
          <template #default="scope">
            <el-tag v-if="scope.row.is_special === 1" type="danger">
              {{ scope.row.special_type || '是' }}
            </el-tag>
            <el-tag v-else type="info">否</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
            <el-popconfirm title="删除后将同时删除其成绩、请假等关联数据，确定吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑学生' : '新增学生'" width="640px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="姓名" required>
          <el-input v-model="form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="性别">
          <el-radio-group v-model="form.gender">
            <el-radio label="男">男</el-radio>
            <el-radio label="女">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="出生年月">
          <el-date-picker
            v-model="form.birth"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择出生日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="家长姓名">
          <el-input v-model="form.parent_name" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="家庭住址">
          <el-input v-model="form.address" />
        </el-form-item>
        <el-form-item label="家庭情况">
          <el-input v-model="form.family_info" placeholder="家庭成员、经济状况等" />
        </el-form-item>
        <el-form-item label="特殊情况">
          <el-switch v-model="form.is_special" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="情况说明" v-if="form.is_special === 1">
          <el-input v-model="form.special_type" placeholder="如单亲/孤儿等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="handleSave">确定</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="Excel 导入学生" width="520px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="请上传包含以下表头的 Excel：name(姓名)、gender(性别)、birth(出生年月)、parent_name(家长姓名)、phone(联系电话)、family_info(家庭情况)、address(地址)、special_type(特殊情况)"
      />
      <el-upload
        ref="importUploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        drag
        :on-change="onImportChange"
        style="margin-top: 16px"
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

    <el-dialog v-model="detailVisible" title="学生档案详情" width="640px">
      <el-descriptions :column="2" border v-if="detail">
        <el-descriptions-item label="学号">{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ detail.name }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ detail.gender }}</el-descriptions-item>
        <el-descriptions-item label="出生年月">{{ detail.birth }}</el-descriptions-item>
        <el-descriptions-item label="家长姓名">{{ detail.parent_name }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ detail.phone }}</el-descriptions-item>
        <el-descriptions-item label="特殊情况" :span="2">
          <el-tag v-if="detail.is_special === 1" type="danger">{{ detail.special_type || '是' }}</el-tag>
          <el-tag v-else type="info">否</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="家庭情况" :span="2">{{ detail.family_info || '—' }}</el-descriptions-item>
        <el-descriptions-item label="家庭住址" :span="2">{{ detail.address || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getStudents, createStudent, updateStudent, deleteStudent, importStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const importing = ref(false)
const searchQuery = ref('')
const dialogVisible = ref(false)
const importVisible = ref(false)
const detailVisible = ref(false)
const importUploadRef = ref()
const allStudents = ref([])
const filtered = ref([])
const detail = ref(null)
const importFile = ref(null)

const form = ref({
  id: null,
  name: '',
  gender: '男',
  birth: '',
  parent_name: '',
  phone: '',
  family_info: '',
  address: '',
  is_special: 0,
  special_type: ''
})

const filterStudents = () => {
  if (!searchQuery.value) {
    filtered.value = allStudents.value
  } else {
    filtered.value = allStudents.value.filter((s) => s.name.includes(searchQuery.value))
  }
}

const resetForm = () => {
  form.value = {
    id: null,
    name: '',
    gender: '男',
    birth: '',
    parent_name: '',
    phone: '',
    family_info: '',
    address: '',
    is_special: 0,
    special_type: ''
  }
}

const openCreate = () => {
  resetForm()
  dialogVisible.value = true
}

const openEdit = (row) => {
  form.value = { ...row }
  dialogVisible.value = true
}

const viewDetail = (row) => {
  detail.value = row
  detailVisible.value = true
}

const loadStudents = async () => {
  loading.value = true
  try {
    allStudents.value = await getStudents()
    filterStudents()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!form.value.name) {
    ElMessage.warning('请输入学生姓名')
    return
  }
  saving.value = true
  try {
    const payload = { ...form.value }
    if (payload.id) {
      await updateStudent(payload.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createStudent(payload)
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    loadStudents()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  try {
    await deleteStudent(id)
    ElMessage.success('删除成功')
    loadStudents()
  } catch (e) {
    // 拦截器已提示
  }
}

const onImportChange = (file) => {
  importFile.value = file.raw
}

const handleImport = async () => {
  if (!importFile.value) {
    ElMessage.warning('请先选择 Excel 文件')
    return
  }
  importing.value = true
  try {
    const fd = new FormData()
    fd.append('file', importFile.value)
    const data = await importStudents(fd)
    ElMessage.success(`成功导入 ${data.imported} 名学生`)
    importVisible.value = false
    if (importUploadRef.value) importUploadRef.value.clearFiles()
    importFile.value = null
    loadStudents()
  } catch (e) {
    // 拦截器已提示
  } finally {
    importing.value = false
  }
}

onMounted(loadStudents)
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
