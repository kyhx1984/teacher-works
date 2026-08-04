import request from './request'

// ================= 统计数据 =================
export const getStats = () => request.get('/stats')

// ================= 资源管理 =================
export const getResources = () => request.get('/resources')
export const uploadResource = (formData) =>
  request.post('/resources', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteResource = (id) => request.delete(`/resources/${id}`)

// ================= 试卷管理 =================
export const getExams = () => request.get('/exams')
export const createExam = (data) => request.post('/exams', data)
export const deleteExam = (id) => request.delete(`/exams/${id}`)

// ================= 背书管理 =================
export const getRecitations = () => request.get('/recitations')
export const createRecitation = (data) => request.post('/recitations', data)
export const updateRecitation = (id, data) => request.put(`/recitations/${id}`, data)
export const deleteRecitation = (id) => request.delete(`/recitations/${id}`)

// ================= 学生档案 =================
export const getStudents = () => request.get('/students')
export const getStudent = (id) => request.get(`/students/${id}`)
export const createStudent = (data) => request.post('/students', data)
export const updateStudent = (id, data) => request.put(`/students/${id}`, data)
export const deleteStudent = (id) => request.delete(`/students/${id}`)
export const importStudents = (formData) =>
  request.post('/students/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ================= 成绩管理 =================
export const getScores = () => request.get('/scores')
export const importScores = (formData) =>
  request.post('/scores/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ================= 积分管理 =================
export const getPoints = () => request.get('/points')
export const createPoint = (data) => request.post('/points', data)
export const deletePoint = (id) => request.delete(`/points/${id}`)

// ================= 请假管理 =================
export const getLeaves = () => request.get('/leaves')
export const createLeave = (data) => request.post('/leaves', data)
export const changeLeaveStatus = (id, status) => request.post('/leaves', { id, status })
export const deleteLeave = (id) => request.delete(`/leaves/${id}`)

// ================= 期末评价 =================
export const getEvaluations = () => request.get('/evaluations')
export const generateEvaluations = () => request.post('/evaluations/generate')
export const updateEvaluation = (id, data) => request.put(`/evaluations/${id}`, data)

// ================= 家校沟通 =================
export const getCommunications = () => request.get('/communications')
export const createCommunication = (data) => request.post('/communications', data)
export const deleteCommunication = (id) => request.delete(`/communications/${id}`)

// ================= 座位表 =================
export const getSeats = () => request.get('/seats')

// ================= 系统设置 =================
export const getSettings = () => request.get('/settings')
export const updateSetting = (key, value) => request.put(`/settings/${key}`, { value })