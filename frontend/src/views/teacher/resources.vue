<template>
  <div class="resources-container">
    <el-card shadow="never">
      <template #header>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            placeholder="搜索资源名称"
            style="width: 250px"
            clearable
            @input="filterResources"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getResources, uploadResource, deleteResource } from '../../api'

const loading = ref(false)
const uploading = ref(false)
const searchQuery = ref('')
const dialogVisible = ref(false)
const uploadRef = ref()
const rawList = ref([])
const filtered = ref([])

const form = ref({ title: '', type: '', file: null })

const allResources = ref([])

const filterResources = () => {
  if (!searchQuery.value) {
    filtered.value = allResources.value
  } else {
    filtered.value = allResources.value.filter((r) => r.title.includes(searchQuery.value))
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
  form.value = { title: '', type: '', file: null }
  if (uploadRef.value) uploadRef.value.clearFiles()
  dialogVisible.value = true
}

const loadResources = async () => {
  loading.value = true
  try {
    allResources.value = await getResources()
    filterResources()
  } catch (e) {
    // 拦截器已提示
  } finally {
    loading.value = false
  }
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

onMounted(loadResources)
</script>

<style scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
