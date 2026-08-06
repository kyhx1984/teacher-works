<template>
  <div class="resources-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <div class="filters">
            <el-select v-model="filterType" placeholder="资源类型" clearable style="width: 140px; margin-right: 10px" @change="loadResources">
              <el-option label="PDF" value="PDF" />
              <el-option label="Word" value="Word" />
              <el-option label="PPT" value="PPT" />
              <el-option label="Excel" value="Excel" />
              <el-option label="图片" value="图片" />
              <el-option label="视频" value="视频" />
              <el-option label="音频" value="音频" />
              <el-option label="其他" value="其他" />
            </el-select>
            <el-select v-model="filterCategory" placeholder="功能类别" clearable style="width: 140px; margin-right: 10px" @change="loadResources">
              <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
            </el-select>
            <el-input
              v-model="searchQuery"
              placeholder="模糊搜索资源名称"
              style="width: 250px"
              clearable
              @input="onSearchInput"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
            <el-button type="info" plain @click="openCategoryDialog">
              <el-icon><Setting /></el-icon>类别管理
            </el-button>
          </div>
          <el-button type="primary" @click="openUpload">
            <el-icon><Upload /></el-icon>上传资源
          </el-button>
        </div>
      </template>

      <el-table :data="filtered" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="title" label="资源名称" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="120">
          <template #default="scope">
            <el-tag :type="getTypeTag(scope.row.type)">{{ scope.row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="功能类别" width="140">
          <template #default="scope">
            <el-tag v-if="scope.row.category_name" type="success" size="small">
              {{ scope.row.category_name }}
            </el-tag>
            <span v-else class="text-muted">未分类</span>
          </template>
        </el-table-column>
        <el-table-column prop="upload_time" label="上传时间" width="180" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="downloadResource(scope.row)">下载</el-button>
            <el-popconfirm title="确定删除该资源吗？" @confirm="handleDelete(scope.row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="上传资源" width="500px">
      <el-form label-width="80px">
        <el-form-item label="资源名称">
          <el-input v-model="form.title" placeholder="请输入资源名称" />
        </el-form-item>
        <el-form-item label="资源类型">
          <el-select v-model="form.type" placeholder="请选择" style="width: 100%">
            <el-option label="PDF" value="PDF" />
            <el-option label="Word" value="Word" />
            <el-option label="PPT" value="PPT" />
            <el-option label="Excel" value="Excel" />
            <el-option label="图片" value="图片" />
            <el-option label="视频" value="视频" />
            <el-option label="音频" value="音频" />
            <el-option label="其他" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="功能类别">
          <el-select v-model="form.category_id" placeholder="选择功能类别（可选）" clearable style="width: 100%">
            <el-option v-for="cat in categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            accept="*"
            :on-change="onFileChange"
            :on-remove="onFileRemove"
            drag
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">拖拽文件到此处或 <em>点击上传</em></div>
          </el-upload>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="uploading" @click="handleUpload">确定上传</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 类别管理对话框 -->
    <el-dialog v-model="categoryDialogVisible" title="功能类别管理" width="500px">
      <div class="category-manage">
        <div class="category-input">
          <el-input v-model="newCategoryName" placeholder="输入新类别名称" style="width: 200px" />
          <el-button type="primary" @click="handleAddCategory" :loading="categorySaving">添加</el-button>
        </div>
        <el-table :data="categories" style="width: 100%; margin-top: 16px" v-loading="categoryLoading">
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" label="类别名称" />
          <el-table-column label="操作" width="100">
            <template #default="scope">
              <el-popconfirm title="确定删除该类别吗？" @confirm="handleDeleteCategory(scope.row.id)">
                <template #reference>
                  <el-button link type="danger" size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getResources, uploadResource, deleteResource, getResourceCategories, createResourceCategory, deleteResourceCategory } from '../../api'

const loading = ref(false)
const uploading = ref(false)
const searchQuery = ref('')
const filterType = ref('')
const filterCategory = ref('')
const dialogVisible = ref(false)
const uploadRef = ref()
const rawList = ref([])
const filtered = ref([])

const form = ref({ title: '', type: '', category_id: null, file: null })

const allResources = ref([])

// 类别管理相关
const categories = ref([])
const categoryDialogVisible = ref(false)
const categoryLoading = ref(false)
const categorySaving = ref(false)
const newCategoryName = ref('')

// 搜索防抖
let searchTimer = null
const onSearchInput = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadResources()
  }, 300)
}

const loadResources = async () => {
  loading.value = true
  try {
    const params = {}
    if (filterType.value) params.type = filterType.value
    if (filterCategory.value) params.category_id = filterCategory.value
    if (searchQuery.value) params.keyword = searchQuery.value
    
    const queryString = new URLSearchParams(params).toString()
    const url = queryString ? `/resources?${queryString}` : '/resources'
    allResources.value = await getResources(url)
    filtered.value = allResources.value
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
}

const loadCategories = async () => {
  categoryLoading.value = true
  try {
    categories.value = await getResourceCategories()
  } catch (e) {
    // 拦截器已提示
  } finally {
    categoryLoading.value = false
  }
}

const openCategoryDialog = () => {
  newCategoryName.value = ''
  categoryDialogVisible.value = true
  loadCategories()
}

const handleAddCategory = async () => {
  if (!newCategoryName.value.trim()) {
    ElMessage.warning('请输入类别名称')
    return
  }
  categorySaving.value = true
  try {
    await createResourceCategory({ name: newCategoryName.value.trim() })
    ElMessage.success('添加成功')
    newCategoryName.value = ''
    loadCategories()
  } catch (e) {
    // 拦截器已提示
  } finally {
    categorySaving.value = false
  }
}

const handleDeleteCategory = async (id) => {
  try {
    await deleteResourceCategory(id)
    ElMessage.success('删除成功')
    loadCategories()
  } catch (e) {
    // 拦截器已提示
  }
}

const getTypeTag = (type) => {
  const map = {
    PDF: 'danger',
    Word: 'primary',
    PPT: 'warning',
    Excel: 'success',
    图片: 'info',
    视频: 'warning',
    音频: 'success'
  }
  return map[type] || 'info'
}

const downloadResource = (row) => {
  const a = document.createElement('a')
  a.href = `/uploads/${row.file_path}`
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}

const onFileChange = (file) => {
  form.value.file = file.raw
  if (!form.value.title) {
    form.value.title = file.name.replace(/\.[^.]+$/, '')
  }
}

const onFileRemove = () => {
  form.value.file = null
}

const openUpload = () => {
  form.value = { title: '', type: '', category_id: null, file: null }
  if (uploadRef.value) uploadRef.value.clearFiles()
  dialogVisible.value = true
}

const handleUpload = async () => {
  if (!form.value.file) {
    ElMessage.warning('请先选择文件')
    return
  }
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', form.value.file)
    fd.append('title', form.value.title || form.value.file.name)
    fd.append('type', form.value.type || '其他')
    if (form.value.category_id) {
      fd.append('category_id', form.value.category_id)
    }
    await uploadResource(fd)
    ElMessage.success('上传成功')
    dialogVisible.value = false
    loadResources()
  } catch (e) {
    // 拦截器已提示
  } finally {
    uploading.value = false
  }
}

const handleDelete = async (id) => {
  try {
    await deleteResource(id)
    ElMessage.success('删除成功')
    loadResources()
  } catch (e) {
    // 拦截器已提示
  }
}

onMounted(() => {
  loadResources()
  loadCategories()
})
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
