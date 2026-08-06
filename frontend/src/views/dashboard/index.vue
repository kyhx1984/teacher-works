<template>
  <div class="dashboard-container">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>资源总数</span>
            <el-icon class="icon-blue"><Files /></el-icon>
          </div>
          <div class="card-value">{{ stats.resources }}</div>
          <div class="card-footer">教师上传的教学资源</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>试卷数量</span>
            <el-icon class="icon-green"><Document /></el-icon>
          </div>
          <div class="card-value">{{ stats.exams }}</div>
          <div class="card-footer">累计录入的试卷</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>今日请假</span>
            <el-icon class="icon-orange"><Calendar /></el-icon>
          </div>
          <div class="card-value">{{ stats.leaves_today }}</div>
          <div class="card-footer">在假中 {{ stats.active_leaves }} 人</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>家校沟通</span>
            <el-icon class="icon-purple"><ChatDotRound /></el-icon>
          </div>
          <div class="card-value">{{ stats.communications }}</div>
          <div class="card-footer">累计沟通 {{ stats.communications }} 次</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>学生人数</span>
            <el-icon class="icon-teal"><User /></el-icon>
          </div>
          <div class="card-value">{{ stats.students }}</div>
          <div class="card-footer">班级在册学生</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>待背记录</span>
            <el-icon class="icon-blue"><Reading /></el-icon>
          </div>
          <div class="card-value">{{ stats.pending_recitations }}</div>
          <div class="card-footer">尚未完成的背书记录</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>班级总积分</span>
            <el-icon class="icon-gold"><Trophy /></el-icon>
          </div>
          <div class="card-value">{{ stats.total_points }}</div>
          <div class="card-footer">累计发放积分</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>快捷入口</span>
            <el-icon class="icon-green"><Odometer /></el-icon>
          </div>
          <div class="quick-links">
            <el-button type="primary" size="small" plain @click="$router.push('/teacher/resources')">上传资源</el-button>
            <el-button type="success" size="small" plain @click="$router.push('/advisor/students')">学生档案</el-button>
            <el-button type="warning" size="small" plain @click="$router.push('/advisor/leaves')">请假管理</el-button>
            <el-button type="info" size="small" plain @click="$router.push('/advisor/communications')">家校沟通</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新增功能统计：作业与背书任务 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>作业任务</span>
            <el-icon class="icon-teal"><EditPen /></el-icon>
          </div>
          <div class="card-value">{{ stats.homework_total }}</div>
          <div class="card-footer">作业记录总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>待交作业</span>
            <el-icon class="icon-orange"><EditPen /></el-icon>
          </div>
          <div class="card-value">{{ stats.homework_pending }}</div>
          <div class="card-footer">尚未完成的作业记录</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>背书任务</span>
            <el-icon class="icon-purple"><Reading /></el-icon>
          </div>
          <div class="card-value">{{ stats.recitation_tasks }}</div>
          <div class="card-footer">已发布背书任务数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="data-card">
          <div class="card-header">
            <span>背书已完成</span>
            <el-icon class="icon-green"><Reading /></el-icon>
          </div>
          <div class="card-value">{{ stats.recitation_completed }}</div>
          <div class="card-footer">累计完成背书记录</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 数据可视化图表 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-title">近期请假趋势</div>
          </template>
          <div ref="leaveChartRef" style="width: 100%; height: 300px;"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-title">学生成绩分布</div>
          </template>
          <div ref="scoreChartRef" style="width: 100%; height: 300px;"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-title">待办任务提醒</div>
          </template>
          <el-table :data="pendingTasks" style="width: 100%" v-if="pendingTasks.length">
            <el-table-column prop="title" label="任务标题" />
            <el-table-column prop="priority" label="优先级" width="100">
              <template #default="scope">
                <el-tag :type="getPriorityType(scope.row.priority)">
                  {{ getPriorityText(scope.row.priority) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="due_date" label="截止日期" width="120">
              <template #default="scope">
                <span :class="{ 'overdue': isOverdue(scope.row) }">
                  {{ scope.row.due_date || '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button link type="primary" @click="$router.push('/teacher/tasks')">
                  查看
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无待办任务" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-title">最近班级动态</div>
          </template>
          <el-timeline v-if="activities.length">
            <el-timeline-item
              v-for="(act, index) in activities"
              :key="index"
              :timestamp="act.time"
              placement="top"
              :type="act.type === 'leave' ? 'warning' : act.type === 'resource' ? 'primary' : 'success'"
            >
              <el-card shadow="never">
                <h4>{{ act.title }}</h4>
              </el-card>
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无动态，快去添加数据吧" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getStats, getLeaves, getScores, getTasks } from '../../api'

const stats = ref({
  resources: 0,
  exams: 0,
  students: 0,
  leaves_today: 0,
  active_leaves: 0,
  communications: 0,
  pending_recitations: 0,
  total_points: 0,
  // 新增字段：作业与背书任务统计
  homework_pending: 0,
  homework_total: 0,
  recitation_tasks: 0,
  recitation_completed: 0
})
const activities = ref([])
const pendingTasks = ref([])

// 图表相关
const leaveChartRef = ref(null)
const scoreChartRef = ref(null)
let leaveChartInstance = null
let scoreChartInstance = null

// 格式化日期为 YYYY-MM-DD
const formatDate = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 渲染近期请假趋势折线图（最近7天）
const renderLeaveChart = (leaves) => {
  if (!leaveChartRef.value) return
  if (!leaveChartInstance) {
    leaveChartInstance = echarts.init(leaveChartRef.value)
  }
  // 生成最近7天的日期数组
  const days = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(formatDate(d))
  }
  // 按开始日期统计每天的请假人数
  const countMap = {}
  days.forEach(d => { countMap[d] = 0 })
  leaves.forEach(item => {
    const start = item.start_date ? item.start_date.slice(0, 10) : ''
    if (countMap[start] !== undefined) countMap[start]++
  })
  leaveChartInstance.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      name: '请假人数',
      type: 'line',
      data: days.map(d => countMap[d]),
      smooth: true,
      itemStyle: { color: '#409eff' },
      areaStyle: { color: 'rgba(64, 158, 255, 0.15)' },
      label: { show: true, position: 'top' }
    }]
  })
}

// 渲染学生成绩分布饼图
const renderScoreChart = (scores) => {
  if (!scoreChartRef.value) return
  if (!scoreChartInstance) {
    scoreChartInstance = echarts.init(scoreChartRef.value)
  }
  // 计算各分数段人数
  const ranges = { '优秀(90-100)': 0, '良好(80-89)': 0, '中等(70-79)': 0, '及格(60-69)': 0, '不及格(0-59)': 0 }
  scores.forEach(s => {
    const score = Number(s.score)
    if (score >= 90) ranges['优秀(90-100)']++
    else if (score >= 80) ranges['良好(80-89)']++
    else if (score >= 70) ranges['中等(70-79)']++
    else if (score >= 60) ranges['及格(60-69)']++
    else ranges['不及格(0-59)']++
  })
  const colors = ['#67c23a', '#409eff', '#e6a23c', '#f56c6c', '#909399']
  scoreChartInstance.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    color: colors,
    series: [{
      name: '成绩分布',
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      label: { show: true, formatter: '{b}\n{d}%' },
      data: Object.keys(ranges).map(k => ({ name: k, value: ranges[k] }))
    }]
  })
}

// 窗口 resize 时调整图表大小
const handleResize = () => {
  leaveChartInstance && leaveChartInstance.resize()
  scoreChartInstance && scoreChartInstance.resize()
}

// 任务相关辅助函数
const getPriorityType = (priority) => {
  const map = { high: 'danger', medium: 'warning', low: 'info' }
  return map[priority] || 'info'
}

const getPriorityText = (priority) => {
  const map = { high: '高', medium: '中', low: '低' }
  return map[priority] || '中'
}

const isOverdue = (task) => {
  if (!task.due_date || task.status === 'completed') return false
  return new Date(task.due_date) < new Date()
}

// 加载待办任务
const loadPendingTasks = async () => {
  try {
    const tasks = await getTasks()
    pendingTasks.value = tasks.filter(t => t.status !== 'completed').slice(0, 5)
  } catch (e) {
    console.error('加载待办任务失败:', e)
  }
}

onMounted(async () => {
  try {
    const data = await getStats()
    stats.value = { ...stats.value, ...data.stats }
    activities.value = data.activities || []
  } catch (e) {
    // 错误已在拦截器中提示
  }
  // 并行加载请假与成绩数据用于图表展示
  try {
    const [leaves, scores] = await Promise.all([getLeaves(), getScores()])
    nextTick(() => {
      renderLeaveChart(leaves)
      renderScoreChart(scores)
    })
  } catch (e) {
    // 错误已在拦截器中提示
  }
  // 加载待办任务
  loadPendingTasks()
  window.addEventListener('resize', handleResize)
})

// 组件卸载时销毁图表实例，避免内存泄漏
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (leaveChartInstance) {
    leaveChartInstance.dispose()
    leaveChartInstance = null
  }
  if (scoreChartInstance) {
    scoreChartInstance.dispose()
    scoreChartInstance = null
  }
})
</script>

<style scoped>
.data-card {
  height: 150px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #909399;
  font-size: 14px;
}

.card-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  margin: 10px 0;
}

.card-footer {
  font-size: 12px;
  color: #909399;
}

.icon-blue { color: #409eff; font-size: 20px; }
.icon-green { color: #67c23a; font-size: 20px; }
.icon-orange { color: #ffb84d; font-size: 20px; }
.icon-purple { color: #b37feb; font-size: 20px; }
.icon-teal { color: #2bb3c0; font-size: 20px; }
.icon-gold { color: #e6a23c; font-size: 20px; }

.mt-20 {
  margin-top: 20px;
}

.card-header-title {
  font-weight: bold;
  font-size: 16px;
}

.quick-links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.quick-links .el-button {
  margin-left: 0;
  width: 100%;
}

h4 {
  margin: 0 0 4px;
}
</style>
