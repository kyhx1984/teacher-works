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
      <el-form :model="form" label-width="90px">
        <el-form-item label="学生姓名">
          <el-input v-model="form.student_name" placeholder="多个学生用逗号或顿号分隔" />
        </el-form-item>
        <el-form-item label="科目">
          <el-input v-model="form.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="篇目名称">
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getRecitations, createRecitation, updateRecitation, deleteRecitation } from '../../api'

const loading = ref(false)
const saving = ref(false)
const searchQuery = ref('')
const filterStatus = ref(null)
const dialogVisible = ref(false)
const allList = ref([])
const filtered = ref([])

const form = ref({ student_name: '', subject: '语文', article: '' })

const filterList = () => {
  filtered.value = allList.value.filter((item) => {
    const matchQuery =
      !searchQuery.value ||
      item.student_name.includes(searchQuery.value) ||
      (item.article || '').includes(searchQuery.value)
    const matchStatus =
      filterStatus.value === null || filterStatus.value === '' || item.status === filterStatus.value
    return matchQuery && matchStatus
  })
}

const openCreate = () => {
  form.value = { student_name: '', subject: '语文', article: '' }
  dialogVisible.value = true
}

const loadList = async () => {
  loading.value = true
  try {
    allList.value = await getRecitations()
    filterList()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  if (!form.value.student_name || !form.value.article) {
    ElMessage.warning('请填写学生姓名和篇目名称')
    return
  }
  saving.value = true
  try {
    const names = form.value.student_name
      .split(/[,，、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    for (const name of names) {
      await createRecitation({
        student_name: name,
        subject: form.value.subject,
        article: form.value.article,
        status: 0
      })
    }
    ElMessage.success(`已登记 ${names.length} 条背书任务`)
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
