<template>
  <div class="schedule-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="header-left">
            <span class="header-title">班级课程表</span>
            <div class="remark-note" :title="scheduleRemark || '点击添加备注提醒'" @click="openRemarkDialog">
              <el-icon><Memo /></el-icon>
              <span class="remark-text">{{ scheduleRemark || '添加备注提醒' }}</span>
              <el-icon class="remark-edit"><EditPen /></el-icon>
            </div>
          </div>
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
            <el-button type="info" plain size="small" @click="openTimeSlotDialog">
              <el-icon><Clock /></el-icon>时间段设置
            </el-button>
            <el-button type="primary" plain size="small" @click="handleSave">
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
            <div
              class="day-column"
              v-for="(day, index) in weekDays"
              :key="index"
              :class="{ 'today-column': index === todayIndex }"
            >
              {{ day }}
              <span v-if="index === todayIndex" class="today-badge">今天</span>
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
                :class="{ 'today-column': dayIndex === todayIndex }"
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

          <!-- 午间行（备注） -->
          <div class="period-section noon-section">
            <div class="section-label noon-label">午间</div>
            <div class="period-row noon-row">
              <div class="time-column">
                <div class="period-name">午休</div>
                <div class="period-time">{{ getTimeSlot('noon', 0) }}</div>
              </div>
              <div
                class="day-column noon-column"
                v-for="(day, dayIndex) in weekDays"
                :key="'noon-' + dayIndex"
                :class="{ 'today-column': dayIndex === todayIndex }"
                @click="openNoonEdit(dayIndex)"
              >
                <div v-if="getNoonRemark(dayIndex)" class="noon-remark-display">
                  {{ getNoonRemark(dayIndex) }}
                </div>
                <div v-else class="schedule-empty noon-empty">
                  <el-icon><EditPen /></el-icon>
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
                :class="{ 'today-column': dayIndex === todayIndex }"
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

    <!-- 备注提醒对话框 -->
    <el-dialog v-model="remarkDialogVisible" title="备注提醒" width="450px">
      <el-input
        v-model="scheduleRemarkInput"
        type="textarea"
        :rows="3"
        placeholder="例如：本周六补课（国庆调休），周五课程调整到周六"
      />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="remarkDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="remarkSaving" @click="handleSaveRemark">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑课程对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingItem.id ? '编辑课程' : '添加课程'" width="500px">>
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

    <!-- 午间备注对话框 -->
    <el-dialog v-model="noonDialogVisible" title="午间备注" width="450px">
      <el-form label-width="80px">
        <el-form-item label="星期">
          <el-tag>{{ weekDays[noonEditing.day] }}</el-tag>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="noonEditing.remark"
            type="textarea"
            :rows="3"
            placeholder="可选，如：午间值班、午自习安排等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="noonDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveNoon">确定</el-button>
      </template>
    </el-dialog>

    <!-- 时间段设置对话框 -->
    <el-dialog v-model="timeSlotDialogVisible" title="时间段设置" width="600px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        title="修改后点击保存，课表展示时间将自动更新"
      />
      <el-table :data="timeSlotList" style="width: 100%" size="small">
        <el-table-column prop="name" label="节次" width="100" />
        <el-table-column label="开始时间" width="180">
          <template #default="scope">
            <el-time-select
              v-model="scope.row.start"
              :max-time="scope.row.end"
              placeholder="开始"
              start="06:00"
              step="00:05"
              end="22:00"
              style="width: 100%"
            />
          </template>
        </el-table-column>
        <el-table-column label="结束时间" width="180">
          <template #default="scope">
            <el-time-select
              v-model="scope.row.end"
              :min-time="scope.row.start"
              placeholder="结束"
              start="06:00"
              step="00:05"
              end="22:00"
              style="width: 100%"
            />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="timeSlotDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="timeSlotSaving" @click="handleSaveTimeSlots">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSchedule, saveSchedule, deleteSchedule, getScheduleTimeSlots, saveScheduleTimeSlots, getSettings, updateSetting } from '../../api'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const scheduleData = ref([])
const formRef = ref()

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 当前星期在 weekDays 中的下标（0=周一 ... 6=周日），用于高亮今天的列
const todayIndex = ref(-1)
const initToday = () => {
  const day = new Date().getDay()
  todayIndex.value = day === 0 ? 6 : day - 1
}

// 备注提醒（存储在 settings 表的 schedule_remark 键中）
const scheduleRemark = ref('')
const remarkDialogVisible = ref(false)
const scheduleRemarkInput = ref('')
const remarkSaving = ref(false)

// 加载备注提醒
const loadRemark = async () => {
  try {
    const res = await getSettings()
    if (res && res.schedule_remark) {
      scheduleRemark.value = res.schedule_remark
    }
  } catch (e) {
    // 拦截器已提示
  }
}

// 打开备注提醒对话框
const openRemarkDialog = () => {
  scheduleRemarkInput.value = scheduleRemark.value
  remarkDialogVisible.value = true
}

// 保存备注提醒
const handleSaveRemark = async () => {
  remarkSaving.value = true
  try {
    await updateSetting('schedule_remark', scheduleRemarkInput.value.trim())
    scheduleRemark.value = scheduleRemarkInput.value.trim()
    ElMessage.success('备注提醒已保存')
    remarkDialogVisible.value = false
  } catch (e) {
    // 拦截器已提示
  } finally {
    remarkSaving.value = false
  }
}

// 节数设置
const morningPeriods = ref(4)
const afternoonPeriods = ref(3)

// 时间段配置（从后端加载）
const timeSlots = ref([])

// 午间备注数据（按星期存储，period=0 表示午间）
const noonDialogVisible = ref(false)
const noonEditing = ref({ day: 0, remark: '' })

// 时间段设置对话框
const timeSlotDialogVisible = ref(false)
const timeSlotList = ref([])
const timeSlotSaving = ref(false)

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

// 获取时间段（从加载的配置中读取）
const getTimeSlot = (section, period) => {
  if (!timeSlots.value.length) return ''
  if (section === 'morning') {
    const item = timeSlots.value.find(t => t.period === period)
    return item ? `${item.start}-${item.end}` : ''
  } else if (section === 'afternoon') {
    const afternoonPeriod = morningPeriods.value + period
    const item = timeSlots.value.find(t => t.period === afternoonPeriod)
    return item ? `${item.start}-${item.end}` : ''
  } else if (section === 'noon') {
    const item = timeSlots.value.find(t => t.period === 0)
    return item ? `${item.start}-${item.end}` : ''
  }
  return ''
}

// 获取指定位置的课程
const getScheduleItem = (dayIndex, period) => {
  return scheduleData.value.find(item => item.week_day === dayIndex && item.period === period)
}

// 获取午间备注
const getNoonRemark = (dayIndex) => {
  const item = scheduleData.value.find(item => item.week_day === dayIndex && item.period === 0)
  return item ? item.noon_remark : ''
}

// 加载数据
const loadData = async () => {
  loading.value = true
  try {
    const [schedules, slots] = await Promise.all([getSchedule(), getScheduleTimeSlots()])
    scheduleData.value = schedules
    timeSlots.value = slots || []
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

// 打开午间备注对话框
const openNoonEdit = (dayIndex) => {
  noonEditing.value = {
    day: dayIndex,
    remark: getNoonRemark(dayIndex)
  }
  noonDialogVisible.value = true
}

// 保存午间备注
const handleSaveNoon = async () => {
  saving.value = true
  try {
    // period=0 表示午间，subject 固定为"午休"
    await saveSchedule({
      week_day: noonEditing.value.day,
      period: 0,
      subject: '午休',
      teacher: '',
      room: '',
      color: '',
      remark: '',
      noon_remark: noonEditing.value.remark || ''
    })
    ElMessage.success('保存成功')
    noonDialogVisible.value = false
    loadData()
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

// 打开时间段设置对话框
const openTimeSlotDialog = () => {
  // 深拷贝当前时间段到编辑列表
  timeSlotList.value = timeSlots.value.map(t => ({ ...t }))
  timeSlotDialogVisible.value = true
}

// 保存时间段设置
const handleSaveTimeSlots = async () => {
  timeSlotSaving.value = true
  try {
    await saveScheduleTimeSlots({ time_slots: timeSlotList.value })
    timeSlots.value = [...timeSlotList.value]
    ElMessage.success('时间段保存成功')
    timeSlotDialogVisible.value = false
  } catch (e) {
    // 拦截器已提示
  } finally {
    timeSlotSaving.value = false
  }
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

onMounted(() => {
  initToday()
  loadData()
  loadRemark()
})
</script>

<style scoped>
/* 整体缩小约15%：减小 padding、字号、间距 */
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.header-title {
  font-weight: bold;
  font-size: 15px;
}
/* 备注提醒样式 */
.remark-note {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #e6a23c;
  background: #fdf6ec;
  border: 1px dashed #e6a23c;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  max-width: 320px;
  white-space: nowrap;
  transition: all 0.2s;
}
.remark-note:hover {
  background: #faecd8;
}
.remark-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remark-edit {
  flex-shrink: 0;
}
.action-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ctrl-label {
  font-size: 12px;
  color: #606266;
}
.schedule-board {
  padding: 14px 0;
  overflow-x: auto;
}
.schedule-grid {
  min-width: 680px;
}
.grid-header {
  display: flex;
  background: #f5f7fa;
  border-radius: 7px 7px 0 0;
  font-weight: bold;
  font-size: 13px;
}
/* 今天的列高亮 */
.today-badge {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 10px;
  color: #fff;
  background: #ffb84d;
  border-radius: 8px;
  font-weight: normal;
  vertical-align: middle;
}
.grid-header .today-column {
  background: #fff7e6;
  color: #e6a23c;
}
.period-row .day-column.today-column {
  background: #fffbf2;
}
.noon-column.today-column {
  background: #fffbf2;
}
.today-column .schedule-item {
  box-shadow: inset 0 0 0 2px rgba(230, 162, 60, 0.4);
}
.time-column {
  width: 85px;
  padding: 8px;
  text-align: center;
  border-right: 1px solid #ebeef5;
  flex-shrink: 0;
}
.day-column {
  flex: 1;
  padding: 8px;
  text-align: center;
  border-right: 1px solid #ebeef5;
  min-width: 85px;
}
.day-column:last-child {
  border-right: none;
}
.period-section {
  margin-top: 0;
}
.section-label {
  background: #ecf5ff;
  padding: 5px 8px;
  font-weight: bold;
  font-size: 12px;
  color: #409eff;
  border-left: 1px solid #ebeef5;
  border-right: 1px solid #ebeef5;
}
.noon-label {
  background: #fdf6ec;
  color: #e6a23c;
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
  font-size: 12px;
}
.period-time {
  font-size: 10px;
  color: #909399;
  margin-top: 3px;
}
.schedule-item {
  padding: 7px;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 50px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.schedule-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);
}
.item-subject {
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 3px;
}
.item-detail {
  font-size: 10px;
  opacity: 0.9;
}
.item-remark {
  font-size: 10px;
  color: #ffeb3b;
  margin-top: 3px;
  font-style: italic;
}
.schedule-empty {
  padding: 14px;
  text-align: center;
  color: #c0c4cc;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.schedule-empty:hover {
  background: #f5f7fa;
  color: #409eff;
}
/* 午间备注样式 */
.noon-section {
  background: #fefcf8;
}
.noon-row {
  min-height: 40px;
}
.noon-column {
  cursor: pointer;
  transition: all 0.2s;
}
.noon-column:hover {
  background: #fdf6ec;
}
.noon-empty {
  min-height: 40px;
  color: #e6a23c;
}
.noon-remark-display {
  font-size: 11px;
  color: #e6a23c;
  line-height: 1.4;
  word-break: break-all;
  text-align: center;
  padding: 4px;
}
</style>
