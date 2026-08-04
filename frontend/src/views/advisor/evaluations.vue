<template>
  <div class="evaluations-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="header-info">
            <span>学生期末评价</span>
            <el-tooltip content="系统将根据成绩与积分自动生成评语，已生成的学生不会被覆盖" placement="top">
              <el-icon class="info-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <div class="action-buttons">
            <el-button type="success" plain :loading="exporting" @click="handleExport">
              <el-icon><Download /></el-icon>导出评价表
            </el-button>
            <el-button type="primary" :loading="generating" @click="handleGenerate">
              <el-icon><MagicStick /></el-icon>一键生成评价
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="evaluations" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="teacher_score" label="教师评分" width="110" align="center">
          <template #default="scope">
            <span :class="'score-' + gradeClass(scope.row.teacher_score)">{{ scope.row.teacher_score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="final_grade" label="等级" width="90" align="center">
          <template #default="scope">
            <el-tag :type="gradeTag(scope.row.final_grade)">{{ scope.row.final_grade }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="comment" label="评语" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">修改</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="empty-hint" v-if="!loading && !evaluations.length">
        <el-empty description="暂无评价记录，点击右上角「一键生成评价」" :image-size="90" />
      </div>
    </el-card>

    <el-dialog v-model="dialogVisible" title="修改评价" width="560px">
      <el-form label-width="90px">
        <el-form-item label="学生">
          <span>{{ form.student_name }}</span>
        </el-form-item>
        <el-form-item label="教师评分">
          <el-input-number v-model="form.teacher_score" :min="0" :max="100" />
        </el-form-item>
        <el-form-item label="等级">
          <el-select v-model="form.final_grade" style="width: 120px">
            <el-option label="A" value="A" />
            <el-option label="B" value="B" />
            <el-option label="C" value="C" />
            <el-option label="D" value="D" />
          </el-select>
        </el-form-item>
        <el-form-item label="评语">
          <el-input type="textarea" :rows="5" v-model="form.comment" />
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
import { getEvaluations, generateEvaluations, updateEvaluation, exportEvaluations } from '../../api'

const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const exporting = ref(false)
const dialogVisible = ref(false)
const evaluations = ref([])

const form = ref({ id: null, student_name: '', teacher_score: 85, final_grade: 'B', comment: '' })

const gradeClass = (score) => {
  if (score >= 90) return 'good'
  if (score >= 80) return 'mid'
  if (score >= 70) return 'ok'
  return 'bad'
}

const gradeTag = (grade) => {
  const map = { A: 'success', B: 'primary', C: 'warning', D: 'danger' }
  return map[grade] || 'info'
}

const loadData = async () => {
  loading.value = true
  try {
    evaluations.value = await getEvaluations()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const openEdit = (row) => {
  form.value = { ...row }
  dialogVisible.value = true
}

const handleGenerate = async () => {
  generating.value = true
  try {
    const data = await generateEvaluations()
    ElMessage.success(`已生成 ${data.generated} 条评价`)
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    generating.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    await updateEvaluation(form.value.id, {
      teacher_score: form.value.teacher_score,
      final_grade: form.value.final_grade,
      comment: form.value.comment
    })
    ElMessage.success('修改成功')
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 导出期末评价 Excel
const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await exportEvaluations()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `期末评价表_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    // 拦截器已提示
  } finally {
    exporting.value = false
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
.header-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  font-size: 16px;
}
.info-icon {
  color: #909399;
  cursor: pointer;
}
.action-buttons {
  display: flex;
  gap: 10px;
}
.score-good { color: #67c23a; font-weight: bold; }
.score-mid { color: #409eff; font-weight: bold; }
.score-ok { color: #e6a23c; }
.score-bad { color: #f56c6c; }
.empty-hint {
  margin-top: 8px;
}
</style>