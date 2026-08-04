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
          <el-button type="primary" @click="openCreate">
            <el-icon><Plus /></el-icon>登记沟通
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
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
    </el-card>

    <el-dialog v-model="dialogVisible" title="登记沟通记录" width="560px">
      <el-form label-width="90px">
        <el-form-item label="学生" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="form.date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="沟通方式">
          <el-select v-model="form.method" style="width: 100%">
            <el-option label="电话" value="电话" />
            <el-option label="微信" value="微信" />
            <el-option label="QQ" value="QQ" />
            <el-option label="家访" value="家访" />
            <el-option label="到校面谈" value="到校面谈" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="沟通内容">
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
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getCommunications, createCommunication, deleteCommunication, getStudents } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const searchQuery = ref('')
const allList = ref([])
const filtered = ref([])
const students = ref([])

const form = ref({ student_id: null, date: '', method: '电话', content: '', feedback: '' })

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
}

const openCreate = () => {
  const today = new Date().toISOString().slice(0, 10)
  form.value = { student_id: null, date: today, method: '电话', content: '', feedback: '' }
  dialogVisible.value = true
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
  if (!form.value.student_id) {
    ElMessage.warning('请选择学生')
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

onMounted(loadData)
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>