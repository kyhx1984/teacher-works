<template>
  <div class="schedule-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <span class="header-title">班级课程表</span>
          <div class="action-buttons">
            <span class="ctrl-label">上午节数：</span>
            <el-input-number
              v-model="morningPeriods"
              :min="1"
              :max="6"
              :step="1"
              size="small"
              @change="onPeriodsChange"
            />
            <span class="ctrl-label">下午节数：</span>
            <el-input-number
              v-model="afternoonPeriods"
              :min="0"
              :max="4"
              :step="1"
              size="small"
              @change="onPeriodsChange"
            />
            <el-button type="primary" plain @click="handleSave">
              <el-icon><Check /></el-icon>保存课程
            </el-button>
          </div>
        </div>
      </template>

      <div class="schedule-board" v-loading="loading">
        <div class="schedule-grid">
          <!-- 表头 -->
          <div class="grid-header">
            <div class="time-column">时间</div>
            <div class="day-column" v-for="(day, index) in weekDays" :key="index">
              {{ day }}
            </div>
          </div>
          
          <!-- 上午课程 -->
          <div class="period-section" v-if="morningPeriods > 0">
            <div class="section-label">上午</div>
            <div class="period-row" v-for="period in morningPeriods" :key="'morning-' + period">
              <div class="time-column">
                <div class="period-name">第{{ period }}节</div>
                <div class="period-time">{{ getTimeSlot('morning', period) }}</div>
              </div>
              <div 
                class="day-column" 
                v-for="(day, dayIndex) in weekDays" 
                :key="dayIndex"
                @click="openEdit(dayIndex, period)"
              >
                <div 
                  v-if="getScheduleItem(dayIndex, period)" 
                  class="schedule-item"
                  :style="{ backgroundColor: getScheduleItem(dayIndex, period).color || '#409eff' }"
                >
                  <div class="item-subject">{{ getScheduleItem(dayIndex, period).subject }}</div>
                  <div class="item-detail">{{ getScheduleItem(dayIndex, period).teacher }}</div>
                  <div class="item-detail">{{ getScheduleItem(dayIndex, period).room }}</div>
                  <div v-if="getScheduleItem(dayIndex, period).remark" class="item-remark">
                    {{ getScheduleItem(dayIndex, period).remark }}
                  </div>
                </div>
                <div v-else class="schedule-empty">
                  <el-icon><Plus /></el-icon>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 下午课程 -->
          <div class="period-section" v-if="afternoonPeriods > 0">
            <div class="section-label">下午</div>
            <div class="period-row" v-for="period in afternoonPeriods" :key="'afternoon-' + period">
              <div class="time-column">
                <div class="period-name">第{{ morningPeriods + period }}节</div>
                <div class="period-time">{{ getTimeSlot('afternoon', period) }}</div>
              </div>
              <div 
                class="day-column" 
                v-for="(day, dayIndex) in weekDays" 
                :key="dayIndex"
                @click="openEdit(dayIndex, morningPeriods + period)"
              >
                <div 
                  v-if="getScheduleItem(dayIndex, morningPeriods + period)" 
                  class="schedule-item"
                  :style="{ backgroundColor: getScheduleItem(dayIndex, morningPeriods + period).color || '#409eff' }"
                >
                  <div class="item-subject">{{ getScheduleItem(dayIndex, morningPeriods + period).subject }}</div>
                  <div class="item-detail">{{ getScheduleItem(dayIndex, morningPeriods + period).teacher }}</div>
                  <div class="item-detail">{{ getScheduleItem(dayIndex, morningPeriods + period).room }}</div>
                  <div v-if="getScheduleItem(dayIndex, morningPeriods + period).remark" class="item-remark">
                    {{ getScheduleItem(dayIndex, morningPeriods + period).remark }}
                  </div>
                </div>
                <div v-else class="schedule-empty">
                  <el-icon><Plus /></el-icon>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 编辑课程对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingItem.id ? '编辑课程' : '添加课程'" width="500px">
      <el-form ref="formRef" :model="editingItem" :rules="rules" label-width="80px">
        <el-form-item label="星期">
          <el-tag>{{ weekDays[editingItem.week_day] }}</el-tag>
        </el-form-item>
        <el-form-item label="节次">
          <el-tag>第{{ editingItem.period }}节</el-tag>
        </el-form-item>
        <el-form-item label="科目" prop="subject">
          <el-input v-model="editingItem.subject" placeholder="例如：语文" />
        </el-form-item>
        <el-form-item label="教师">
          <el-input v-model="editingItem.teacher" placeholder="任课教师" />
        </el-form-item>
        <el-form-item label="教室">
          <el-input v-model="editingItem.room" placeholder="上课教室" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="editingItem.color" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="editingItem.remark"
            type="textarea"
            :rows="2"
            placeholder="可选，如：调课说明等"
          />
        </el-form-item>
        <el-form-item v-if="editingItem.id">
          <el-button type="danger" plain @click="handleDelete">
            <el-icon><Delete /></el-icon>删除课程
          </el-button>
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
import { getSchedule, saveSchedule, deleteSchedule } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const scheduleData = ref([])
const formRef = ref()

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 节数设置
const morningPeriods = ref(4)
const afternoonPeriods = ref(3)

// 当前编辑的课程
const editingItem = ref({
  id: null,
  week_day: 0,
  period: 1,
  subject: '',
  teacher: '',
  room: '',
  color: '#409eff',
  remark: ''
})

const rules = {
  subject: [{ required: true, message: '请输入科目', trigger: 'blur' }]
}

// 获取时间段
const getTimeSlot = (section, period) => {
  if (section === 'morning') {
    const times = ['08:00-08:45', '08:55-09:40', '10:00-10:45', '10:55-11:40', '14:00-14:45', '14:55-15:40']
    return times[period - 1] || ''
  } else {
    const times = ['14:00-14:45', '14:55-15:40', '16:00-16:45', '16:55-17:40']
    return times[period - 1] || ''
  }
}

// 获取指定位置的课程
const getScheduleItem = (dayIndex, period) => {
  return scheduleData.value.find(item => item.week_day === dayIndex && item.period === period)
}

// 加载数据
const loadData = async () => {
  loading.value = true
  try {
    scheduleData.value = await getSchedule()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 打开编辑对话框
const openEdit = (dayIndex, period) => {
  const existing = getScheduleItem(dayIndex, period)
  if (existing) {
    editingItem.value = { ...existing }
  } else {
    editingItem.value = {
      id: null,
      week_day: dayIndex,
      period: period,
      subject: '',
      teacher: '',
      room: '',
      color: '#409eff',
      remark: ''
    }
  }
  dialogVisible.value = true
}

// 保存课程
const handleSave = async () => {
  if (!formRef.value) {
    // 如果没有表单引用，直接保存
    saving.value = true
    try {
      await saveSchedule(editingItem.value)
      ElMessage.success(editingItem.value.id ? '更新成功' : '添加成功')
      dialogVisible.value = false
      loadData()
    } catch (e) {
      // 拦截器已提示
    } finally {
      saving.value = false
    }
    return
  }
  
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }
  saving.value = true
  try {
    await saveSchedule(editingItem.value)
    ElMessage.success(editingItem.value.id ? '更新成功' : '添加成功')
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 删除课程
const handleDelete = async () => {
  if (!editingItem.value.id) {
    dialogVisible.value = false
    return
  }
  try {
    await deleteSchedule(editingItem.value.id)
    ElMessage.success('删除成功')
    dialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  }
}

// 节数变化
const onPeriodsChange = () => {
  // 节数变化不需要特殊处理，只是视图变化
}

onMounted(loadData)
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-title {
  font-weight: bold;
  font-size: 16px;
}
.action-buttons {
  display: flex;
  gap: 10px;
  align-items: center;
}
.ctrl-label {
  font-size: 13px;
  color: #606266;
}
.schedule-board {
  padding: 20px 0;
  overflow-x: auto;
}
.schedule-grid {
  min-width: 800px;
}
.grid-header {
  display: flex;
  background: #f5f7fa;
  border-radius: 8px 8px 0 0;
  font-weight: bold;
}
.time-column {
  width: 100px;
  padding: 12px;
  text-align: center;
  border-right: 1px solid #ebeef5;
  flex-shrink: 0;
}
.day-column {
  flex: 1;
  padding: 12px;
  text-align: center;
  border-right: 1px solid #ebeef5;
  min-width: 100px;
}
.day-column:last-child {
  border-right: none;
}
.period-section {
  margin-top: 0;
}
.section-label {
  background: #ecf5ff;
  padding: 8px 12px;
  font-weight: bold;
  color: #409eff;
  border-left: 1px solid #ebeef5;
  border-right: 1px solid #ebeef5;
}
.period-row {
  display: flex;
  border-bottom: 1px solid #ebeef5;
}
.period-row:last-child {
  border-bottom: none;
}
.time-column {
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: #fafafa;
}
.period-name {
  font-weight: bold;
  font-size: 14px;
}
.period-time {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}
.schedule-item {
  padding: 10px;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.schedule-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.item-subject {
  font-weight: bold;
  font-size: 14px;
  margin-bottom: 4px;
}
.item-detail {
  font-size: 12px;
  opacity: 0.9;
}
.item-remark {
  font-size: 11px;
  color: #ffeb3b;
  margin-top: 4px;
  font-style: italic;
}
.schedule-empty {
  padding: 20px;
  text-align: center;
  color: #c0c4cc;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.schedule-empty:hover {
  background: #f5f7fa;
  color: #409eff;
}
</style>
