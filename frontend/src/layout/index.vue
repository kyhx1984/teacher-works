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
          <el-menu-item index="/teacher/homework">
            <el-icon><EditPen /></el-icon>
            <span>作业管理</span>
          </el-menu-item>
          <el-menu-item index="/teacher/schedule">
            <el-icon><Calendar /></el-icon>
            <span>我的课程表</span>
          </el-menu-item>
          <el-menu-item index="/teacher/tasks">
            <el-icon><List /></el-icon>
            <span>临时工作区</span>
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
          <el-tag v-if="gradeInfo.level" type="warning" size="small" class="grade-tag">
            {{ gradeInfo.level }}（{{ gradeInfo.year }}级）
          </el-tag>
          <el-button
            v-if="gradeInfo.level"
            type="warning"
            size="small"
            plain
            :loading="upgrading"
            @click="handleUpgradeGrade"
          >
            <el-icon><Top /></el-icon>年级升级
          </el-button>
        </div>
        <div class="header-right">
          <el-avatar :size="32" src="https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png" />
          <span class="username" @click="openEditDialog" style="cursor: pointer;" title="点击修改教师名称">{{ teacherName }}</span>
          <el-button text type="primary" :icon="Key" @click="openPasswordDialog">修改密码</el-button>
          <el-button text type="danger" :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
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

    <!-- 修改密码对话框 -->
    <el-dialog v-model="showPasswordDialog" title="修改密码" width="420px">
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="100px">
        <el-form-item label="旧密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入旧密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPasswordDialog = false">取消</el-button>
        <el-button type="primary" :loading="passwordLoading" @click="savePassword">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Key, SwitchButton } from '@element-plus/icons-vue'
import { getSettings, updateSetting, upgradeGrade, changePassword } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)
const pageTitle = computed(() => route.meta.title || '工作台')

// 教师信息
const teacherName = ref('陈老师')
const showEditDialog = ref(false)
const editForm = ref({ teacherName: '' })

// 年级信息
const gradeInfo = ref({ level: '', year: '' })
const upgrading = ref(false)

// 加载教师信息
// 注意：request.js 拦截器在 code===200 时已返回 res.data，所以 res 就是 settings 对象
const loadTeacherInfo = async () => {
  try {
    const res = await getSettings()
    if (res && res.teacher_name) {
      teacherName.value = res.teacher_name
    }
    // 读取年级信息
    if (res && res.grade_level) {
      gradeInfo.value.level = res.grade_level
      gradeInfo.value.year = res.grade_year || ''
    }
  } catch (err) {
    console.error('加载教师信息失败:', err)
  }
}

// 年级升级
const handleUpgradeGrade = async () => {
  try {
    await ElMessageBox.confirm('确认升级到下一年级？此操作将更新年级信息。', '提示', { type: 'warning' })
  } catch (e) {
    // 用户取消
    return
  }
  upgrading.value = true
  try {
    const res = await upgradeGrade()
    if (res && res.grade_level) {
      gradeInfo.value.level = res.grade_level
      gradeInfo.value.year = res.grade_year || ''
    }
    ElMessage.success('年级升级成功')
  } catch (e) {
    // 拦截器已提示
  } finally {
    upgrading.value = false
  }
}

// 保存教师信息
const saveTeacherInfo = async () => {
  if (!editForm.value.teacherName.trim()) {
    ElMessage.warning('教师名称不能为空')
    return
  }
  try {
    await updateSetting('teacher_name', editForm.value.teacherName.trim())
    teacherName.value = editForm.value.teacherName.trim()
    ElMessage.success('保存成功')
    showEditDialog.value = false
  } catch (err) {
    ElMessage.error('保存失败')
  }
}

// 打开编辑对话框
const openEditDialog = () => {
  editForm.value.teacherName = teacherName.value
  showEditDialog.value = true
}

// ================= 修改密码 =================
const showPasswordDialog = ref(false)
const passwordLoading = ref(false)
const passwordFormRef = ref(null)
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 确认密码校验：必须与新密码一致
const validateConfirmPassword = (rule, value, callback) => {
  if (value !== passwordForm.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// 打开修改密码对话框
const openPasswordDialog = () => {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  showPasswordDialog.value = true
}

// 保存新密码
const savePassword = async () => {
  if (!passwordFormRef.value) return
  try {
    await passwordFormRef.value.validate()
  } catch {
    return
  }
  passwordLoading.value = true
  try {
    await changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    })
    ElMessage.success('密码修改成功')
    showPasswordDialog.value = false
  } catch (err) {
    // 错误信息已由 request 拦截器提示
  } finally {
    passwordLoading.value = false
  }
}

// ================= 退出登录 =================
const handleLogout = () => {
  ElMessageBox.confirm('确认退出登录吗？', '提示', {
    type: 'warning',
    confirmButtonText: '退出',
    cancelButtonText: '取消'
  })
    .then(() => {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      router.push('/login')
    })
    .catch(() => {
      // 用户取消
    })
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

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
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
