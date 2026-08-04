<template>
  <el-container class="layout-container">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <h2>教师工作台</h2>
      </div>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        background-color="#ffffff"
        text-color="#303133"
        active-text-color="#FFB84D"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        
        <el-sub-menu index="teacher">
          <template #title>
            <el-icon><Briefcase /></el-icon>
            <span>教师工作</span>
          </template>
          <el-menu-item index="/teacher/resources">
            <el-icon><Files /></el-icon>
            <span>资源管理</span>
          </el-menu-item>
          <el-menu-item index="/teacher/exams">
            <el-icon><Document /></el-icon>
            <span>试卷管理</span>
          </el-menu-item>
          <el-menu-item index="/teacher/recitations">
            <el-icon><Reading /></el-icon>
            <span>背书情况</span>
          </el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="advisor">
          <template #title>
            <el-icon><Avatar /></el-icon>
            <span>班主任工作</span>
          </template>
          <el-menu-item index="/advisor/students">
            <el-icon><User /></el-icon>
            <span>学生档案</span>
          </el-menu-item>
          <el-menu-item index="/advisor/scores">
            <el-icon><DataLine /></el-icon>
            <span>成绩分析</span>
          </el-menu-item>
          <el-menu-item index="/advisor/points">
            <el-icon><Trophy /></el-icon>
            <span>积分管理</span>
          </el-menu-item>
          <el-menu-item index="/advisor/leaves">
            <el-icon><Calendar /></el-icon>
            <span>请假管理</span>
          </el-menu-item>
          <el-menu-item index="/advisor/evaluations">
            <el-icon><Star /></el-icon>
            <span>期末评价</span>
          </el-menu-item>
          <el-menu-item index="/advisor/communications">
            <el-icon><ChatDotRound /></el-icon>
            <span>家校沟通</span>
          </el-menu-item>
          <el-menu-item index="/advisor/seats">
            <el-icon><Grid /></el-icon>
            <span>座位表</span>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>
    
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <el-avatar :size="32" src="https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png" />
          <span class="username" @click="openEditDialog" style="cursor: pointer;" title="点击修改教师名称">{{ teacherName }}</span>
        </div>
      </el-header>
      
      <el-main class="main-content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>

    <!-- 编辑教师名称对话框 -->
    <el-dialog v-model="showEditDialog" title="修改教师名称" width="400px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="教师名称">
          <el-input v-model="editForm.teacherName" placeholder="请输入教师名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTeacherInfo">保存</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { getSettings, updateSetting } from '../api'
import { ElMessage } from 'element-plus'

const route = useRoute()
const activeMenu = computed(() => route.path)
const pageTitle = computed(() => route.meta.title || '工作台')

// 教师信息
const teacherName = ref('陈老师')
const showEditDialog = ref(false)
const editForm = ref({ teacherName: '' })

// 加载教师信息
const loadTeacherInfo = async () => {
  try {
    const res = await getSettings()
    if (res.code === 200 && res.data.teacher_name) {
      teacherName.value = res.data.teacher_name
    }
  } catch (err) {
    console.error('加载教师信息失败:', err)
  }
}

// 保存教师信息
const saveTeacherInfo = async () => {
  if (!editForm.value.teacherName.trim()) {
    ElMessage.warning('教师名称不能为空')
    return
  }
  try {
    const res = await updateSetting('teacher_name', editForm.value.teacherName.trim())
    if (res.code === 200) {
      teacherName.value = editForm.value.teacherName.trim()
      ElMessage.success('保存成功')
      showEditDialog.value = false
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (err) {
    ElMessage.error('保存失败')
  }
}

// 打开编辑对话框
const openEditDialog = () => {
  editForm.value.teacherName = teacherName.value
  showEditDialog.value = true
}

onMounted(() => {
  loadTeacherInfo()
})
</script>

<style scoped>
.layout-container {
  height: 100vh;
}

.aside {
  background-color: #ffffff;
  box-shadow: 2px 0 8px 0 rgba(29,35,41,.05);
  z-index: 10;
}

.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #409EFF;
  border-bottom: 1px solid #f0f0f0;
}

.logo h2 {
  margin: 0;
  font-size: 18px;
}

.el-menu-vertical {
  border-right: none;
}

.el-menu-item.is-active {
  background-color: #fff6eb;
  border-right: 3px solid #FFB84D;
}

.header {
  background-color: #ffffff;
  box-shadow: 0 1px 4px rgba(0,21,41,.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 9;
}

.page-title {
  font-size: 18px;
  font-weight: bold;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.username {
  font-size: 14px;
  color: #606266;
}

.main-content {
  background-color: #F7F7F5;
  padding: 24px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
