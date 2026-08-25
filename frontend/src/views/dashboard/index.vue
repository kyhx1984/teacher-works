<template>
  <div class="dashboard-container">
    <!-- 第一行：4个核心业务卡片（需要教师重点关注的动态信息） -->
    <el-row :gutter="20">
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
            <span>待交作业</span>
            <el-icon class="icon-teal"><EditPen /></el-icon>
          </div>
          <div class="card-value">{{ stats.homework_pending }}</div>
          <div class="card-footer">尚未完成的作业记录</div>
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
            <span>家校沟通</span>
            <el-icon class="icon-purple"><ChatDotRound /></el-icon>
          </div>
          <div class="card-value">{{ stats.communications }}</div>
          <div class="card-footer">累计沟通 {{ stats.communications }} 次</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第二行：数据概览（紧凑横向展示其他纯数量统计） -->
    <el-card shadow="hover" class="overview-card mt-20">
      <div class="overview-grid">
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-blue"><Files /></el-icon>资源总数</div>
          <div class="overview-value">{{ stats.resources }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-green"><Document /></el-icon>试卷数量</div>
          <div class="overview-value">{{ stats.exams }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-teal"><User /></el-icon>学生人数</div>
          <div class="overview-value">{{ stats.students }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-gold"><Trophy /></el-icon>班级总积分</div>
          <div class="overview-value">{{ stats.total_points }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-teal"><EditPen /></el-icon>作业记录</div>
          <div class="overview-value">{{ stats.homework_total }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-purple"><Reading /></el-icon>背书任务</div>
          <div class="overview-value">{{ stats.recitation_tasks }}</div>
        </div>
        <div class="overview-item">
          <div class="overview-label"><el-icon class="icon-green"><Reading /></el-icon>背书已完成</div>
          <div class="overview-value">{{ stats.recitation_completed }}</div>
        </div>
      </div>
    </el-card>

    <!-- 第三行：快捷入口（左）+ 待办任务提醒（右）-->
    <el-row :gutter="20" class="mt-20">
      <el-col :span="8">
        <el-card shadow="hover" class="quick-card">
          <template #header>
            <div class="card-header-title with-action">
              <span>快捷入口</span>
              <el-button link type="primary" size="small" @click="openQuickManage">
                <el-icon><Setting /></el-icon>管理
              </el-button>
            </div>
          </template>
          <div class="quick-links-grid" v-if="quickEntries.length">
            <el-button
              v-for="item in quickEntries"
              :key="item.path"
              :type="item.color"
              size="small"
              plain
              @click="router.push(item.path)"
            >
              {{ item.name }}
            </el-button>
          </div>
          <el-empty v-else description="点击「管理」添加快捷入口" :image-size="60" />
        </el-card>
      </el-col>
      <el-col :span="16">
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
                <el-button link type="primary" @click="router.push('/teacher/tasks')">
                  查看
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无待办任务" :image-size="80" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 第四行：数据可视化图表 -->
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

    <!-- 第五行：最近班级动态 -->
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

    <!-- 快捷入口管理对话框 -->
    <el-dialog v-model="quickManageVisible" title="管理快捷入口" width="560px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        title="勾选需要显示在快捷入口的页面，取消勾选则移除"
      />
      <el-checkbox-group v-model="tempSelectedPaths">
        <div class="quick-manage-group">
          <div class="quick-manage-title">教师工作</div>
          <el-checkbox
            v-for="item in teacherPages"
            :key="item.path"
            :label="item.path"
            class="quick-checkbox"
          >
            {{ item.name }}
          </el-checkbox>
        </div>
        <div class="quick-manage-group">
          <div class="quick-manage-title">班主任工作</div>
          <el-checkbox
            v-for="item in advisorPages"
            :key="item.path"
            :label="item.path"
            class="quick-checkbox"
          >
            {{ item.name }}
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="quickManageVisible = false">取消</el-button>
        <el-button type="primary" @click="saveQuickEntries">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import { getStats, getLeaves, getScores, getTasks } from '../../api'

const router = useRouter()

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

// ================= 快捷入口自定义 =================
// 所有可选页面（教师工作）
const teacherPages = [
  { path: '/teacher/resources', name: '资源管理', color: 'primary' },
  { path: '/teacher/exams', name: '试卷管理', color: 'primary' },
  { path: '/teacher/recitations', name: '背书情况', color: 'success' },
  { path: '/teacher/homework', name: '作业管理', color: 'success' },
  { path: '/teacher/schedule', name: '我的课程表', color: 'warning' },
  { path: '/teacher/tasks', name: '临时工作区', color: 'info' }
]
// 所有可选页面（班主任工作）
const advisorPages = [
  { path: '/advisor/students', name: '学生档案', color: 'success' },
  { path: '/advisor/scores', name: '成绩分析', color: 'primary' },
  { path: '/advisor/points', name: '积分管理', color: 'warning' },
  { path: '/advisor/leaves', name: '请假管理', color: 'warning' },
  { path: '/advisor/evaluations', name: '期末评价', color: 'info' },
  { path: '/advisor/communications', name: '家校沟通', color: 'info' },
  { path: '/advisor/seats', name: '座位表', color: 'info' }
]
const allPages = [...teacherPages, ...advisorPages]

// localStorage 存储键
const QUICK_STORAGE_KEY = 'dashboard_quick_entries'
// 默认快捷入口（首次使用时）
const DEFAULT_QUICK_PATHS = [
  '/teacher/resources',
  '/advisor/students',
  '/advisor/leaves',
  '/advisor/communications'
]

// 当前显示的快捷入口（已排序、带名称和颜色）
const quickEntries = ref([])
// 管理对话框
const quickManageVisible = ref(false)
// 管理对话框中临时勾选的路径列表
const tempSelectedPaths = ref([])

// 从 localStorage 加载快捷入口配置
const loadQuickEntries = () => {
  let paths = DEFAULT_QUICK_PATHS
  try {
    const saved = localStorage.getItem(QUICK_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) paths = parsed
    }
  } catch (e) {
    // 解析失败，使用默认值
  }
  // 根据 allPages 过滤并保留顺序
  quickEntries.value = paths
    .map(p => allPages.find(page => page.path === p))
    .filter(Boolean)
}

// 打开管理对话框：用当前已选路径初始化临时勾选
const openQuickManage = () => {
  tempSelectedPaths.value = quickEntries.value.map(item => item.path)
  quickManageVisible.value = true
}

// 保存快捷入口配置到 localStorage 并刷新显示
const saveQuickEntries = () => {
  try {
    localStorage.setItem(QUICK_STORAGE_KEY, JSON.stringify(tempSelectedPaths.value))
  } catch (e) {
    // 存储失败，忽略
  }
  // 按教师工作→班主任工作的固定顺序展示勾选项
  const ordered = [
    ...teacherPages.filter(p => tempSelectedPaths.value.includes(p.path)),
    ...advisorPages.filter(p => tempSelectedPaths.value.includes(p.path))
  ]
  quickEntries.value = ordered
  quickManageVisible.value = false
}

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

// 渲染学生成绩分布饼图（按学生统计：每个学生取平均分，避免多科/多考次重复计数）
const renderScoreChart = (scores) => {
  if (!scoreChartRef.value) return
  if (!scoreChartInstance) {
    scoreChartInstance = echarts.init(scoreChartRef.value)
  }
  // 按学生分组求平均分（student_id 缺失时按姓名兜底，均无则按单条计）
  const byStudent = new Map()
  scores.forEach(s => {
    const key = s.student_id ?? (s.student_name ? `n:${s.student_name}` : `r:${s.id}`)
    const score = Number(s.score)
    if (!Number.isFinite(score)) return
    if (!byStudent.has(key)) byStudent.set(key, { sum: 0, n: 0 })
    const item = byStudent.get(key)
    item.sum += score
    item.n++
  })
  // 计算各分数段人数
  const ranges = { '优秀(90-100)': 0, '良好(80-89)': 0, '中等(70-79)': 0, '及格(60-69)': 0, '不及格(0-59)': 0 }
  byStudent.forEach(({ sum, n }) => {
    const avg = sum / n
    if (avg >= 90) ranges['优秀(90-100)']++
    else if (avg >= 80) ranges['良好(80-89)']++
    else if (avg >= 70) ranges['中等(70-79)']++
    else if (avg >= 60) ranges['及格(60-69)']++
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
  // 加载快捷入口配置（从 localStorage）
  loadQuickEntries()
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

.card-header-title.with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 数据概览紧凑卡片 */
.overview-card {
  padding: 4px 8px;
}
.overview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.overview-item {
  flex: 1;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 8px;
  border-right: 1px solid #f0f0f0;
}
.overview-item:last-child {
  border-right: none;
}
.overview-label {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}
.overview-label .el-icon {
  font-size: 14px;
}
.overview-value {
  font-size: 22px;
  font-weight: bold;
  color: #303133;
  margin-top: 4px;
}

/* 快捷入口卡片 */
.quick-card {
  height: 100%;
}
.quick-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-content: flex-start;
}
.quick-links-grid .el-button {
  margin-left: 0;
}

/* 快捷入口管理对话框 */
.quick-manage-group {
  margin-bottom: 16px;
}
.quick-manage-title {
  font-weight: bold;
  font-size: 14px;
  color: #303133;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f0f0;
}
.quick-checkbox {
  margin-bottom: 8px;
  width: 140px;
}

h4 {
  margin: 0 0 4px;
}
</style>
