<template>
  <div class="scores-container">
    <el-card shadow="never" class="mb-16">
      <template #header>
        <div class="card-title-row">
          <span>成绩进退分析</span>
          <el-button type="primary" @click="importVisible = true">
            <el-icon><Download /></el-icon>Excel导入成绩
          </el-button>
        </div>
      </template>
      <el-table :data="analysis" style="width: 100%" v-loading="loading">
        <el-table-column prop="student_id" label="学号" width="90" />
        <el-table-column prop="student_name" label="姓名" width="120" />
        <el-table-column prop="exam_count" label="考试次数" width="100" align="center" />
        <el-table-column prop="subject" label="科目" />
        <el-table-column prop="avg" label="平均分" width="100">
          <template #default="scope">
            <span class="score-num">{{ scope.row.avg }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="best" label="最高分" width="100" />
        <el-table-column prop="last_score" label="最近成绩" width="100" />
        <el-table-column prop="trend" label="趋势" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.trend === 'up' ? 'success' : scope.row.trend === 'down' ? 'danger' : 'info'">
              {{ scope.row.trendText }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="header-title">成绩明细</div>
      </template>
      <el-table :data="scores" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="subject" label="科目" width="120" />
        <el-table-column prop="score" label="成绩" width="100">
          <template #default="scope">
            <span :class="scoreClass(scope.row.score)">{{ scope.row.score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="exam_name" label="考试名称" />
      </el-table>
    </el-card>

    <el-dialog v-model="importVisible" title="Excel 导入成绩" width="520px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="请上传包含表头的 Excel：student_id(学号)、subject(科目)、score(成绩)、exam_name(考试名称)"
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getScores, importScores, getStudents } from '../../api'

const loading = ref(false)
const importing = ref(false)
const importVisible = ref(false)
const importUploadRef = ref()
const scores = ref([])
const analysisSummary = ref([])
const importFile = ref(null)

const scoreClass = (score) => {
  if (score >= 90) return 'score-good'
  if (score >= 80) return 'score-mid'
  if (score >= 60) return 'score-ok'
  return 'score-bad'
}

const buildAnalysis = (rows) => {
  const byStudent = {}
  rows.forEach((r) => {
    if (!byStudent[r.student_id]) {
      byStudent[r.student_id] = {
        student_id: r.student_id,
        student_name: r.student_name,
        subjects: {},
        exams: []
      }
    }
    const s = byStudent[r.student_id]
    if (!s.subjects[r.subject]) s.subjects[r.subject] = []
    s.subjects[r.subject].push(r)
    s.exams.push(r)
  })

  analysisSummary.value = Object.values(byStudent).map((s) => {
    const subject = Object.keys(s.subjects)[0]
    const subjectScores = s.subjects[subject] || []
    const allSubjectScores = s.exams
    const avg = allSubjectScores.length
      ? (allSubjectScores.reduce((sum, x) => sum + Number(x.score), 0) / allSubjectScores.length).toFixed(1)
      : '—'
    const best = allSubjectScores.length
      ? Math.max(...allSubjectScores.map((x) => Number(x.score)))
      : '—'
    // 按考试名称分组，取最近两次比较
    const byExam = {}
    allSubjectScores.forEach((x) => {
      if (!byExam[x.exam_name]) byExam[x.exam_name] = []
      byExam[x.exam_name].push(Number(x.score))
    })
    const examNames = Object.keys(byExam).sort()
    const lastAvg = (arr) => (arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null)
    const last = examNames.length ? lastAvg(byExam[examNames[examNames.length - 1]]) : null
    const prev = examNames.length > 1 ? lastAvg(byExam[examNames[examNames.length - 2]]) : null

    let trend = 'flat'
    let trendText = '—'
    if (last != null && prev != null) {
      if (Number(last) > Number(prev)) {
        trend = 'up'
        trendText = `上升 ${(Number(last) - Number(prev)).toFixed(1)}`
      } else if (Number(last) < Number(prev)) {
        trend = 'down'
        trendText = `下降 ${(Number(prev) - Number(last)).toFixed(1)}`
      } else {
        trendText = '持平'
      }
    }
    return {
      student_id: s.student_id,
      student_name: s.student_name,
      subject,
      exam_count: allSubjectScores.length,
      avg,
      best,
      last_score: last,
      trend,
      trendText
    }
  })
}

const onImportChange = (file) => {
  importFile.value = file.raw
}

const loadData = async () => {
  loading.value = true
  try {
    const [scoreRows] = await Promise.all([getScores(), getStudents()])
    scores.value = scoreRows
    buildAnalysis(scoreRows)
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
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
    const data = await importScores(fd)
    ElMessage.success(`成功导入 ${data.imported} 条成绩`)
    importVisible.value = false
    if (importUploadRef.value) importUploadRef.value.clearFiles()
    importFile.value = null
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    importing.value = false
  }
}

onMounted(loadData)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
.header-title-row,
.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  font-size: 16px;
}
.score-header {
  font-weight: bold;
  font-size: 16px;
}
.score-badge {
  font-weight: bold;
  color: #409eff;
}
.avg-good { color: #67c23a; font-weight: bold; }
.avg-mid { color: #409eff; }
.avg-ok { color: #e6a23c; }
.avg-bad { color: #f56c6c; }
.score-good { color: #67c23a; font-weight: bold; }
.score-mid { color: #409eff; }
.score-ok { color: #e6a23c; }
.score-bad { color: #f56c6c; }
</style>