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
            @click="openGradeDialog"
          >
            <el-icon><Top /></el-icon>设置年级
          </el-button>
          <span class="current-date">
            <el-icon><Calendar /></el-icon>
            <span>{{ currentDateText }}</span>
          </span>
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

    <!-- 设置年级对话框 -->
    <el-dialog v-model="showGradeDialog" title="设置入学年份" width="420px">
      <el-alert
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        title="年级将根据入学年份和当前日期自动计算（每年9月升级）"
      />
      <el-form label-width="100px">
        <el-form-item label="当前年级">
          <el-tag type="warning">{{ gradeInfo.level }}</el-tag>
        </el-form-item>
        <el-form-item label="入学年份">
          <el-input-number v-model="gradeYearInput" :min="2000" :max="2100" :step="1" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGradeDialog = false">取消</el-button>
        <el-button type="primary" :loading="gradeSaving" @click="saveGradeYear">确定</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Key, SwitchButton } from '@element-plus/icons-vue'
import { getSettings, updateSetting, getGradeInfo, updateGradeYear, changePassword } from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const activeMenu = computed(() => route.path)
const pageTitle = computed(() => route.meta.title || '工作台')

// 教师信息
const teacherName = ref('陈老师')
const showEditDialog = ref(false)
const editForm = ref({ teacherName: '' })

// 当前日期与星期（每分钟自动刷新，跨天时保持准确）
const currentDateText = ref('')
const updateCurrentDate = () => {
  const now = new Date()
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  currentDateText.value = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`
}

// 年级信息（通过动态计算接口获取）
const gradeInfo = ref({ level: '', year: '' })
const showGradeDialog = ref(false)
const gradeYearInput = ref(2025)
const gradeSaving = ref(false)

// 加载教师信息
// 注意：request.js 拦截器在 code===200 时已返回 res.data，所以 res 就是 settings 对象
const loadTeacherInfo = async () => {
  try {
    const res = await getSettings()
    if (res && res.teacher_name) {
      teacherName.value = res.teacher_name
    }
  } catch (err) {
    console.error('加载教师信息失败:', err)
  }
  // 通过动态计算接口获取年级信息（根据入学年份和当前日期自动计算）
  try {
    const gradeRes = await getGradeInfo()
    if (gradeRes) {
      gradeInfo.value.level = gradeRes.grade_level || ''
      gradeInfo.value.year = gradeRes.grade_year || ''
    }
  } catch (err) {
    console.error('加载年级信息失败:', err)
  }
}

// 打开设置年级对话框
const openGradeDialog = () => {
  gradeYearInput.value = parseInt(gradeInfo.value.year, 10) || 2025
  showGradeDialog.value = true
}

// 保存入学年份
const saveGradeYear = async () => {
  gradeSaving.value = true
  try {
    await updateGradeYear(gradeYearInput.value)
    // 重新获取动态计算的年级信息
    const gradeRes = await getGradeInfo()
    if (gradeRes) {
      gradeInfo.value.level = gradeRes.grade_level || ''
      gradeInfo.value.year = gradeRes.grade_year || ''
    }
    ElMessage.success('年级设置成功')
    showGradeDialog.value = false
  } catch (e) {
    // 拦截器已提示
  } finally {
    gradeSaving.value = false
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
  updateCurrentDate()
  setInterval(updateCurrentDate, 60000)
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

.current-date {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #606266;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 3px 10px;
  white-space: nowrap;
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
