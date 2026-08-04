<template>
  <div class="seats-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <span class="header-title">班级座位表</span>
          <div class="action-buttons">
            <span class="ctrl-label">列数：</span>
            <el-input-number
              v-model="columns"
              :min="3"
              :max="8"
              :step="1"
              size="small"
              @change="onColumnsChange"
            />
            <el-button type="primary" plain @click="handleShuffle">
              <el-icon><Refresh /></el-icon>随机排座
            </el-button>
            <el-button type="info" plain @click="handleReset">
              <el-icon><RefreshLeft /></el-icon>恢复默认
            </el-button>
            <el-button type="success" :loading="saving" @click="handleSave">
              <el-icon><Check /></el-icon>保存座位
            </el-button>
          </div>
        </div>
      </template>

      <div class="seat-board" v-loading="loading">
        <div class="podium">
          <span>讲 台</span>
        </div>
        <div class="hint" v-if="selected">
          已选择「{{ selectedName }}」，请点击另一个座位进行交换（再次点击当前座位可取消）
        </div>
        <div class="seat-rows" v-if="rows.length">
          <div class="seat-row" v-for="(row, i) in rows" :key="i">
            <div class="row-label">第{{ i + 1 }}排</div>
            <div
              v-for="(seat, j) in row"
              :key="j"
              class="seat"
              :class="{ empty: !seat, selected: isSelected(i, j) }"
              @click="onSeatClick(i, j)"
            >
              <template v-if="seat">
                <div class="seat-name">{{ seat.name }}</div>
                <div class="seat-id">{{ seat.student_id }}</div>
              </template>
              <template v-else><div class="seat-empty">空</div></template>
            </div>
          </div>
        </div>
        <el-empty v-else description="暂无学生，请先在「学生档案」中录入学生" :image-size="90" />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getSeats, saveSeats } from '../../api'

const loading = ref(false)
const saving = ref(false)
// 列数（默认 4，范围 3-8）
const columns = ref(4)
// 二维网格：rows[row][col] = { student_id, name } | null
const rows = ref([])
// 当前选中的座位 { row, col } | null
const selected = ref(null)

// 选中座位的学生姓名（用于提示）
const selectedName = computed(() => {
  if (!selected.value) return ''
  const seat = rows.value[selected.value.row]?.[selected.value.col]
  return seat ? seat.name : '空位'
})

const isSelected = (r, c) => {
  return selected.value && selected.value.row === r && selected.value.col === c
}

const loadSeats = async () => {
  loading.value = true
  try {
    const data = await getSeats()
    columns.value = data.columns || 4
    rows.value = data.rows || []
    selected.value = null
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

// 按行优先顺序收集当前所有学生
const collectStudents = () => {
  const list = []
  rows.value.forEach((row) => {
    row.forEach((seat) => {
      if (seat) list.push(seat)
    })
  })
  return list
}

// 按给定学生列表与当前列数重新排列为二维网格
const rearrange = (students) => {
  const cols = columns.value
  const rowCount = Math.ceil(students.length / cols)
  const newRows = []
  for (let r = 0; r < rowCount; r++) {
    newRows.push(new Array(cols).fill(null))
  }
  students.forEach((s, idx) => {
    const r = Math.floor(idx / cols)
    const c = idx % cols
    newRows[r][c] = s
  })
  rows.value = newRows
  selected.value = null
}

// 列数变化时按当前学生顺序重新排列
const onColumnsChange = () => {
  rearrange(collectStudents())
}

// 点击座位：第一次选中，第二次交换两个座位的学生
const onSeatClick = (r, c) => {
  if (!selected.value) {
    selected.value = { row: r, col: c }
    return
  }
  // 再次点击同一座位：取消选中
  if (selected.value.row === r && selected.value.col === c) {
    selected.value = null
    return
  }
  // 交换两个座位的内容
  const sel = selected.value
  const a = rows.value[sel.row][sel.col]
  const b = rows.value[r][c]
  rows.value[sel.row][sel.col] = b
  rows.value[r][c] = a
  selected.value = null
}

// 随机排座：打乱当前学生顺序后排列
const handleShuffle = () => {
  const list = collectStudents()
  if (!list.length) return
  // Fisher-Yates 洗牌
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  rearrange(list)
  ElMessage.success('已随机排座，点击「保存座位」生效')
}

// 恢复默认：按学号顺序排列
const handleReset = () => {
  const list = collectStudents()
  list.sort((a, b) => a.student_id - b.student_id)
  rearrange(list)
  ElMessage.success('已恢复默认排列，点击「保存座位」生效')
}

// 保存座位到后端
const handleSave = async () => {
  const layout = []
  rows.value.forEach((row, r) => {
    row.forEach((seat, c) => {
      if (seat) layout.push({ student_id: seat.student_id, row: r, col: c })
    })
  })
  saving.value = true
  try {
    await saveSeats({ columns: columns.value, layout })
    ElMessage.success('座位保存成功')
    selected.value = null
  } catch (e) {
    // 拦截器已提示
  } finally {
    saving.value = false
  }
}

onMounted(loadSeats)
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
.seat-board {
  padding: 20px 0;
  overflow-x: auto;
}
.podium {
  width: 260px;
  height: 40px;
  margin: 0 auto 24px;
  background: linear-gradient(135deg, #409eff, #79bbff);
  color: #fff;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  letter-spacing: 8px;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}
.hint {
  text-align: center;
  color: #e6a23c;
  font-size: 13px;
  margin-bottom: 16px;
}
.seat-rows {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
}
.seat-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.row-label {
  width: 52px;
  font-size: 12px;
  color: #909399;
  text-align: center;
  flex-shrink: 0;
}
.seat {
  width: 90px;
  height: 54px;
  border-radius: 12px;
  background: #ecf5ff;
  border: 1px solid #d4e4ff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.seat:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(64, 158, 255, 0.25);
  background: #d9ecff;
}
.seat.empty {
  background: #fafafa;
  border: 1px dashed #dcdfe6;
}
.seat.selected {
  outline: 2px solid #409eff;
  background: #d9ecff;
  box-shadow: 0 4px 10px rgba(64, 158, 255, 0.35);
}
.seat-name {
  font-weight: bold;
  font-size: 14px;
  color: #303133;
}
.seat-id {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}
.seat-empty {
  font-size: 12px;
  color: #c0c4cc;
}
</style>
