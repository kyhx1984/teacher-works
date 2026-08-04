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
            <span>待背篇目</span>
            <el-icon class="icon-blue"><Reading /></el-icon>
          </div>
          <div class="card-value">{{ stats.pending_recitations }}</div>
          <div class="card-footer">尚未完成的背书任务</div>
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
import { ref, onMounted } from 'vue'
import { getStats } from '../../api'

const stats = ref({
  resources: 0,
  exams: 0,
  students: 0,
  leaves_today: 0,
  active_leaves: 0,
  communications: 0,
  pending_recitations: 0,
  total_points: 0
})
const activities = ref([])

onMounted(async () => {
  try {
    const data = await getStats()
    stats.value = { ...stats.value, ...data.stats }
    activities.value = data.activities || []
  } catch (e) {
    // 错误已在拦截器中提示
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
