import request from './request'

// ================= 认证 =================
export const login = (data) => request.post('/auth/login', data)
export const checkAuth = () => request.get('/auth/check')
export const changePassword = (data) => request.put('/auth/password', data)

// ================= 统计数据 =================
export const getStats = () => request.get('/stats')

// ================= 资源管理 =================
export const getResources = (url = '/resources') => request.get(url)
export const uploadResource = (formData) =>
  request.post('/resources', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteResource = (id) => request.delete(`/resources/${id}`)

// ================= 试卷管理 =================
export const getExams = (url = '/exams') => request.get(url)
export const createExam = (data) => request.post('/exams', data)
export const updateExam = (id, data) => request.put(`/exams/${id}`, data)
export const deleteExam = (id) => request.delete(`/exams/${id}`)

// ================= 考试记录 =================
export const getExamRecords = (examId) => request.get(`/exam-records?exam_id=${examId}`)
export const createExamRecord = (data) => request.post('/exam-records', data)
export const updateExamRecord = (id, data) => request.put(`/exam-records/${id}`, data)
export const deleteExamRecord = (id) => request.delete(`/exam-records/${id}`)
export const exportExamTemplate = (examId) => request.get(`/exam-records/template?exam_id=${examId}`, { responseType: 'blob' })
export const exportExamData = (examId) => request.get(`/exam-records/export?exam_id=${examId}`, { responseType: 'blob' })
export const importExamRecords = (formData) => request.post('/exam-records/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ================= 背书管理（旧版，保留兼容） =================
export const getRecitations = () => request.get('/recitations')
export const createRecitation = (data) => request.post('/recitations', data)
export const updateRecitation = (id, data) => request.put(`/recitations/${id}`, data)
export const deleteRecitation = (id) => request.delete(`/recitations/${id}`)

// ================= 背书任务管理（新版分级结构） =================
export const getRecitationTasks = () => request.get('/recitation-tasks')
export const createRecitationTask = (formData) => request.post('/recitation-tasks', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const updateRecitationTask = (id, formData) => request.put(`/recitation-tasks/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteRecitationTask = (id) => request.delete(`/recitation-tasks/${id}`)
export const getRecitationRecords = (taskId) => request.get(`/recitation-tasks/${taskId}/records`)
export const createRecitationRecords = (taskId, data) => request.post(`/recitation-tasks/${taskId}/records`, data)
export const updateRecitationRecord = (id, data) => request.put(`/recitation-records/${id}`, data)
export const deleteRecitationRecord = (id) => request.delete(`/recitation-records/${id}`)
export const exportRecitationTask = (taskId) => request.get(`/recitation-tasks/${taskId}/export`, { responseType: 'blob' })

// ================= 作业管理 =================
export const getHomeworkTasks = () => request.get('/homework-tasks')
export const createHomeworkTask = (data) => request.post('/homework-tasks', data)
export const updateHomeworkTask = (id, data) => request.put(`/homework-tasks/${id}`, data)
export const deleteHomeworkTask = (id) => request.delete(`/homework-tasks/${id}`)
export const getHomeworkRecords = (taskId) => request.get(`/homework-tasks/${taskId}/records`)
export const createHomeworkRecords = (taskId, data) => request.post(`/homework-tasks/${taskId}/records`, data)
export const updateHomeworkRecord = (id, data) => request.put(`/homework-records/${id}`, data)
export const deleteHomeworkRecord = (id) => request.delete(`/homework-records/${id}`)
export const exportHomeworkTask = (taskId) => request.get(`/homework-tasks/${taskId}/export`, { responseType: 'blob' })

// ================= 课程表 =================
export const getSchedule = (week) => request.get(`/schedule${week ? `?week=${week}` : ''}`)
export const saveSchedule = (data) => request.post('/schedule', data)
export const deleteSchedule = (id) => request.delete(`/schedule/${id}`)

// ================= 临时工作区 =================
export const getTasks = () => request.get('/tasks')
export const createTask = (data) => request.post('/tasks', data)
export const updateTask = (id, data) => request.put(`/tasks/${id}`, data)
export const deleteTask = (id) => request.delete(`/tasks/${id}`)
export const completeTask = (id) => request.put(`/tasks/${id}/complete`)

// ================= 学生档案 =================
export const getStudents = () => request.get('/students')
export const getStudent = (id) => request.get(`/students/${id}`)
export const createStudent = (data) => request.post('/students', data)
export const updateStudent = (id, data) => request.put(`/students/${id}`, data)
export const deleteStudent = (id) => request.delete(`/students/${id}`)
export const batchDeleteStudents = (ids) => request.delete('/students/batch', { data: { ids } })
export const importStudents = (formData) =>
  request.post('/students/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })

// ================= 成绩管理 =================
export const getScores = () => request.get('/scores')
export const importScores = (formData) =>
  request.post('/scores/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
// 成绩 - 单条操作
export const createScore = (data) => request.post('/scores', data)
export const updateScore = (id, data) => request.put(`/scores/${id}`, data)
export const deleteScore = (id) => request.delete(`/scores/${id}`)
// 成绩 - 批量操作
export const batchDeleteScores = (ids) => request.delete('/scores/batch', { data: { ids } })

// ================= 积分管理 =================
export const getPoints = () => request.get('/points')
export const createPoint = (data) => request.post('/points', data)
export const deletePoint = (id) => request.delete(`/points/${id}`)
export const batchDeletePoints = (ids) => request.delete('/points/batch', { data: { ids } })

// ================= 请假管理 =================
export const getLeaves = () => request.get('/leaves')
export const createLeave = (data) => request.post('/leaves', data)
export const updateLeave = (id, data) => request.put(`/leaves/${id}`, data)
export const changeLeaveStatus = (id, status) => request.post('/leaves', { id, status })
export const deleteLeave = (id) => request.delete(`/leaves/${id}`)
export const batchUpdateLeaveStatus = (ids, status) => request.put('/leaves/batch-status', { ids, status })
export const batchDeleteLeaves = (ids) => request.delete('/leaves/batch', { data: { ids } })

// ================= 期末评价 =================
export const getEvaluations = () => request.get('/evaluations')
export const generateEvaluations = () => request.post('/evaluations/generate')
export const updateEvaluation = (id, data) => request.put(`/evaluations/${id}`, data)

// ================= 家校沟通 =================
export const getCommunications = () => request.get('/communications')
export const createCommunication = (formData) => request.post('/communications', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const deleteCommunication = (id) => request.delete(`/communications/${id}`)
export const batchDeleteCommunications = (ids) => request.delete('/communications/batch', { data: { ids } })

// ================= 座位表 =================
export const getSeats = () => request.get('/seats')
export const saveSeats = (data) => request.put('/seats', data)

// ================= 系统设置 =================
export const getSettings = () => request.get('/settings')
export const updateSetting = (key, value) => request.put(`/settings/${key}`, { value })
export const upgradeGrade = () => request.post('/settings/upgrade-grade')

// ================= 导出 =================
// 成绩导出
export const exportScores = () => request.get('/scores/export', { responseType: 'blob' })
// 学生花名册导出
export const exportStudents = () => request.get('/students/export', { responseType: 'blob' })
// 期末评价导出
export const exportEvaluations = () => request.get('/evaluations/export', { responseType: 'blob' })