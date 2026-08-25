import axios from 'axios'
import { ElMessage } from 'element-plus'

const service = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
})

// 请求拦截器：自动在 header 中带上 token 与当前班级 ID（多班级支持）
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    const currentClassId = localStorage.getItem('currentClassId')
    if (currentClassId) {
      config.headers['X-Class-Id'] = currentClassId
    }
    return config
  },
  (error) => Promise.reject(error)
)

service.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 200) {
        return res.data
      }
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return res
  },
  (error) => {
    // 401 未登录或登录过期：清除登录信息并跳转登录页
    if (error.response && error.response.status === 401) {
      const msg401 =
        (error.response.data && error.response.data.message) ||
        '登录已过期，请重新登录'
      // 登录页（登录失败）与普通页（token 过期）都给出提示，避免静默失败
      ElMessage.error(msg401)
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      // 避免在登录页重复跳转
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }
    const message =
      (error.response && error.response.data && error.response.data.message) ||
      error.message ||
      '网络请求失败'
    if (message !== '取消请求') {
      ElMessage.error(message)
    }
    return Promise.reject(error)
  }
)

export default service
