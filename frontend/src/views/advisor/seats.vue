<template>
  <div class="seats-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <span class="header-title">班级座位表</span>
          <el-button type="primary" plain @click="loadSeats">
            <el-icon><Refresh /></el-icon>重新生成
          </el-button>
        </div>
      </template>

      <div class="seat-board" v-loading="loading">
        <div class="podium">
          <span>讲 台</span>
        </div>
        <div class="seat-rows" v-if="seats.length">
          <div class="seat-row" v-for="(row, i) in seats" :key="i">
            <div class="row-label">第{{ i + 1 }}排</div>
            <div class="seat" :class="{ empty: !row.col1 }">
              <template v-if="row.col1">
                <div class="seat-name">{{ row.col1.name }}</div>
                <div class="seat-id">{{ row.col1.id }}</div>
              </template>
              <template v-else><div class="seat-empty">空</div></template>
            </div>
            <div class="aisle"></div>
            <div class="seat" :class="{ empty: !row.col2 }">
              <template v-if="row.col2">
                <div class="seat-name">{{ row.col2.name }}</div>
                <div class="seat-id">{{ row.col2.id }}</div>
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
import { ref, onMounted } from 'vue'
import { getSeats } from '../../api'

const loading = ref(false)
const seats = ref([])

const loadSeats = async () => {
  loading.value = true
  try {
    seats.value = await getSeats()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
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
.seat-board {
  padding: 20px 0;
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
  cursor: default;
  transition: all 0.2s;
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
.aisle {
  width: 16px;
}
</style>