<template>
  <div class="recitations-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="filters">
            <el-select v-model="filterStatus" placeholder="状态" clearable style="width: 120px; margin-right: 15px">
              <el-option label="未背" :value="0" />
              <el-option label="已背" :value="1" />
            </el-select>
            <el-input
              v-model="searchQuery"
              placeholder="搜索学生姓名或篇目"
              style="width: 200px"
              clearable
              @input="filterList"
            />
          </div>
          <el-button type="primary" @click="openCreate">
            <el-icon><EditPen /></el-icon>登记背书
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生姓名" width="120" />
        <el-table-column prop="subject" label="科目" width="100" />
        <el-table-column prop="article" label="篇目名称" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
              {{ scope.row.status === 1 ? '已背' : '未背' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 0"
              link
              type="success"
              size="small"
              @click="toggleStatus(scope.row)"
            >
              标记为已背
            </el-button>
            <el-button
              v-else
              link
              type="warning"
              size="small"
              @click="toggleStatus(scope.row)"
            >
              撤销已背
            </el-button>
            <el-popconfirm title="确定删除吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记背书任务" width="500px">
      <el-form ref="formRef" :model="form" :rules="recitationRules" label-width="90px">
        <el-form-item label="学生" prop="student_ids" required>
          <el-select
            v-model="form.student_ids"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择学生（可多选）"
            style="width: 100%"
          >
            <el-option
              v-for="s in students"
              :key="s.id"
              :label="`${s.name}（${s.id}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="科目" prop="subject">
          <el-input v-model="form.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="篇目名称" prop="article">
          <el-input v-model="form.article" placeholder="例如：出师表" />
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
import { ref, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getRecitations, createRecitation, updateRecitation, deleteRecitation, getStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const filterStatus = ref(null)
const dialogVisible = ref(false)
const allList = ref([])
const filtered = ref([])
const students = ref([])
const formRef = ref()

// 表单：使用 student_ids 数组支持批量选择
const form = ref({ student_ids: [], subject: '语文', article: '' })

// 背书表单校验规则
const recitationRules = {
  student_ids: [{ required: true, message: '请选择学生', trigger: 'change', type: 'array' }],
  subject: [{ required: true, message: '请输入科目', trigger: 'blur' }],
  article: [{ required: true, message: '请输入篇目', trigger: 'blur' }]
}

const filterList = () => {
  filtered.value = allList.value.filter((item) => {
    const matchQuery =
      !searchQuery.value ||
      (item.student_name || '').includes(searchQuery.value) ||
      (item.article || '').includes(searchQuery.value)
    const matchStatus =
      filterStatus.value === null || filterStatus.value === '' || item.status === filterStatus.value
    return matchQuery && matchStatus
  })
}

const openCreate = () => {
  form.value = { student_ids: [], subject: '语文', article: '' }
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

const loadList = async () => {
  loading.value = true
  try {
    const [recitationRows, studentRows] = await Promise.all([getRecitations(), getStudents()])
    allList.value = recitationRows
    students.value = studentRows
    filterList()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 保存：循环为每个选中学生创建一条背书任务，优先传 student_id
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
    // 通过 id 查找学生姓名（向后端兼容旧逻辑同时传 student_name）
    const findName = (id) => {
      const s = students.value.find((x) => x.id === id)
      return s ? s.name : ''
    }
    for (const sid of form.value.student_ids) {
      await createRecitation({
        student_id: sid,
        student_name: findName(sid),
        subject: form.value.subject,
        article: form.value.article,
        status: 0
      })
    }
    ElMessage.success(`已登记 ${form.value.student_ids.length} 条背书任务`)
    dialogVisible.value = false
    loadList()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

const toggleStatus = async (row) => {
  const next = row.status === 1 ? 0 : 1
  try {
    await updateRecitation(row.id, { status: next })
    row.status = next
    ElMessage.success(next === 1 ? '已标记为已背' : '已撤销已背')
  } catch (e) {
    // 拦截器已提示
  }
}

const handleDelete = async (id) => {
  try {
    await deleteRecitation(id)
    ElMessage.success('删除成功')
    loadList()
  } catch (e) {
    // 拦截器已提示
  }
}

onMounted(loadList)
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
</style>
