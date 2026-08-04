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
      <el-table :data="analysisSummary" style="width: 100%" v-loading="loading">
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

    <!-- 成绩分布图表 -->
    <el-card shadow="never" class="mb-16">
      <div ref="chartRef" style="width: 100%; height: 300px;"></div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="header-title-row">
          <span>成绩明细</span>
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
              <el-icon><Plus /></el-icon>录入成绩
            </el-button>
            <el-button type="success" plain :loading="exporting" @click="handleExport">
              <el-icon><Download /></el-icon>导出
            </el-button>
          </div>
        </div>
      </template>
      <el-table :data="pagedScores" style="width: 100%" v-loading="loading" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="student_name" label="学生" width="110" />
        <el-table-column prop="subject" label="科目" width="120" />
        <el-table-column prop="score" label="成绩" width="100">
          <template #default="scope">
            <span :class="scoreClass(scope.row.score)">{{ scope.row.score }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="exam_name" label="考试名称" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="openEdit(scope.row)">编辑</el-button>
            <el-popconfirm title="确定删除该成绩记录吗？" @confirm="handleDelete(scope.row.id)">
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
        :total="scores.length"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end;"
      />
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

    <!-- 单条成绩录入/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑成绩' : '录入成绩'" width="500px">
      <el-form ref="formRef" :model="form" :rules="scoreRules" label-width="90px">
        <el-form-item label="学生" prop="student_id" required>
          <el-select v-model="form.student_id" placeholder="请选择学生" filterable style="width: 100%">
            <el-option
              v-for="s in students"
              :key="s.id"
              :label="`${s.name}（${s.id}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="科目" prop="subject" required>
          <el-input v-model="form.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="成绩" prop="score" required>
          <el-input-number v-model="form.score" :min="0" :max="100" :precision="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="考试名称" prop="exam_name">
          <el-input v-model="form.exam_name" placeholder="例如：期中考试" />
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
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as echarts from 'echarts'
import {
  getScores,
  importScores,
  createScore,
  updateScore,
  deleteScore,
  batchDeleteScores,
  exportScores,
  getStudents
} from '../../api'

const loading = ref(false)
const importing = ref(false)
const exporting = ref(false)
const saving = ref(false)
const importVisible = ref(false)
const dialogVisible = ref(false)
const importUploadRef = ref()
const formRef = ref()
const scores = ref([])
const students = ref([])
const analysisSummary = ref([])
const importFile = ref(null)

// 批量操作：选中行
const selectedRows = ref([])
const handleSelectionChange = (val) => { selectedRows.value = val }

// 分页：当前页与每页条数（基于全量成绩切片）
const currentPage = ref(1)
const pageSize = ref(20)
const pagedScores = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return scores.value.slice(start, start + pageSize.value)
})

// 成绩分布图表
const chartRef = ref(null)
let chartInstance = null

// 渲染成绩分布柱状图
const renderChart = () => {
  if (!chartRef.value) return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  // 计算各分数段人数
  const ranges = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '0-59': 0 }
  scores.value.forEach(s => {
    const score = Number(s.score)
    if (score >= 90) ranges['90-100']++
    else if (score >= 80) ranges['80-89']++
    else if (score >= 70) ranges['70-79']++
    else if (score >= 60) ranges['60-69']++
    else ranges['0-59']++
  })
  chartInstance.setOption({
    title: { text: '成绩分布', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: Object.keys(ranges) },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: Object.values(ranges),
      itemStyle: {
        color: function (params) {
          const colors = ['#67c23a', '#409eff', '#e6a23c', '#f56c6c', '#909399']
          return colors[params.dataIndex]
        }
      },
      label: { show: true, position: 'top' }
    }]
  })
}

// 窗口 resize 时调整图表大小
const handleResize = () => {
  chartInstance && chartInstance.resize()
}

// 单条成绩表单
const form = ref({
  id: null,
  student_id: null,
  subject: '',
  score: 0,
  exam_name: ''
})

// 成绩表单校验规则
const scoreRules = {
  student_id: [{ required: true, message: '请选择学生', trigger: 'change' }],
  subject: [{ required: true, message: '请输入科目', trigger: 'blur' }],
  score: [{ required: true, message: '请输入成绩', trigger: 'blur' }],
  exam_name: [{ required: true, message: '请输入考试名称', trigger: 'blur' }]
}

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
    const [scoreRows, studentRows] = await Promise.all([getScores(), getStudents()])
    scores.value = scoreRows
    students.value = studentRows
    buildAnalysis(scoreRows)
    // 数据加载完成后重置分页并渲染图表
    currentPage.value = 1
    nextTick(renderChart)
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

// 打开录入对话框
const openCreate = () => {
  form.value = {
    id: null,
    student_id: null,
    subject: '',
    score: 0,
    exam_name: ''
  }
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

// 打开编辑对话框
const openEdit = (row) => {
  form.value = {
    id: row.id,
    student_id: row.student_id,
    subject: row.subject,
    score: Number(row.score),
    exam_name: row.exam_name || ''
  }
  dialogVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

// 保存（新增或编辑）
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
    const payload = {
      student_id: form.value.student_id,
      subject: form.value.subject,
      score: form.value.score,
      exam_name: form.value.exam_name || '期中考试'
    }
    if (form.value.id) {
      await updateScore(form.value.id, payload)
      ElMessage.success('更新成功')
    } else {
      await createScore(payload)
      ElMessage.success('录入成功')
    }
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 删除单条成绩
const handleDelete = async (id) => {
  try {
    await deleteScore(id)
    ElMessage.success('删除成功')
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

// 批量删除成绩
const handleBatchDelete = async () => {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先选择记录')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认删除选中的 ${selectedRows.value.length} 条成绩记录？`,
      '提示',
      { type: 'warning' }
    )
  } catch (e) {
    // 用户取消
    return
  }
  try {
    const ids = selectedRows.value.map((r) => r.id)
    await batchDeleteScores(ids)
    ElMessage.success('批量删除成功')
    selectedRows.value = []
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

// 导出 Excel
const handleExport = async () => {
  exporting.value = true
  try {
    const blob = await exportScores()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `成绩单_${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e) {
    // 拦截器已提示
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadData()
  // 监听窗口大小变化，图表自适应
  window.addEventListener('resize', handleResize)
})

// 组件卸载时销毁图表实例，避免内存泄漏
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
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
.header-title-row {
  font-weight: bold;
  font-size: 16px;
}
.action-buttons {
  display: flex;
  gap: 10px;
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
