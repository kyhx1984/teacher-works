<template>
  <div class="ai-grading">
    <!-- 顶部：功能状态 + 配置入口 -->
    <el-card shadow="never" class="mb-16">
      <div class="topbar">
        <div class="topbar-left">
          <span class="page-name">AI 试卷批改</span>
          <el-tag v-if="aiEnabled" type="success" size="small" effect="dark">已开启</el-tag>
          <el-tag v-else type="info" size="small">未开启</el-tag>
          <span class="model-info" v-if="configSummary">
            <el-icon><Cpu /></el-icon>{{ configSummary }}
          </span>
        </div>
        <el-button type="primary" plain @click="openConfig">
          <el-icon><Setting /></el-icon>模型配置
        </el-button>
      </div>
      <el-alert
        v-if="!aiEnabled"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="AI 批改功能尚未开启"
        description="点击右上角「模型配置」，开启功能并添加至少一个多模态模型供应商（默认 DeepSeek，可添加多个并切换）的服务地址与密钥后即可使用。"
      />
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        style="margin-top: 12px"
        title="AI 为辅助批改，识别与判分可能存在误差，请老师核对后再「采纳到成绩」。"
      />
    </el-card>

    <!-- 发起批改 -->
    <el-card shadow="never" class="mb-16">
      <template #header><span class="card-title">发起 AI 批改</span></template>
      <el-form :inline="true" class="start-form">
        <el-form-item label="试卷">
          <el-select v-model="newForm.exam_id" placeholder="选择试卷" filterable style="width: 260px" @change="onExamChange">
            <el-option v-for="e in exams" :key="e.id" :label="e.title" :value="e.id">
              <span>{{ e.title }}</span>
              <el-tag v-if="e.subject" size="small" type="warning" style="margin-left: 6px">{{ e.subject }}</el-tag>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="学生">
          <el-select v-model="newForm.student_id" placeholder="选择学生" filterable style="width: 180px">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :limit="6"
        accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
        multiple
        list-type="picture-card"
        :on-change="onImageChange"
        :on-remove="onImageChange"
      >
        <el-icon><Plus /></el-icon>
      </el-upload>
      <div class="form-tip">
        上传该学生的试卷照片（可多张，越清晰越准）。若不上传，将自动使用其在「试卷管理 → 考试记录」中已有的试卷照片。
        支持 JPG / PNG / WEBP；iPhone 的 HEIC 请先在相册中另存为 JPG。过大的照片会在上传前自动压缩，以缩短等待时间。
      </div>

      <!-- 标准答案（参考答案）：选填。有答案时 AI 以答案为准判分，更准确；答案存试卷级，录入一次、后续批改自动复用 -->
      <div class="answer-block">
        <div class="answer-head">
          <span class="section-title">参考答案（选填，可显著提升判分准确率）</span>
          <el-button v-if="hasStoredAnswer" link type="danger" size="small" @click="clearAnswer">清空已存答案</el-button>
        </div>
        <el-alert
          v-if="hasStoredAnswer"
          type="success" :closable="false" show-icon style="margin-bottom: 8px"
          :title="'该试卷已录入参考答案' + (storedAnswerSummary ? '（' + storedAnswerSummary + '）' : '') + '，本次批改将自动使用；如需修改可重新填写并覆盖。'"
        />
        <el-radio-group v-model="answerMode" size="small" style="margin-bottom: 8px">
          <el-radio-button value="none">不提供</el-radio-button>
          <el-radio-button value="text">文本输入</el-radio-button>
          <el-radio-button value="file">答案文件</el-radio-button>
          <el-radio-button value="image">答案图片</el-radio-button>
        </el-radio-group>

        <div v-if="answerMode === 'text'" style="margin-bottom: 6px">
          <el-input
            v-model="answerText"
            type="textarea"
            :rows="4"
            placeholder="按行输入每题答案，如：&#10;1. A&#10;2. 42&#10;3. 略（本题解答要点：……）&#10;支持中文题号（一、二、三）"
          />
          <div class="form-tip">可留空只填部分题；未填答案的题 AI 将按常规自行判断。</div>
        </div>

        <div v-if="answerMode === 'file'" style="margin-bottom: 6px">
          <el-upload
            ref="answerFileRef"
            :auto-upload="false"
            :limit="1"
            accept=".txt,.md,.csv"
            :on-change="onAnswerFileChange"
            :on-remove="onAnswerFileChange"
          >
            <el-button size="small" plain><el-icon><Upload /></el-icon>选择答案文件</el-button>
          </el-upload>
          <div class="form-tip" v-if="answerFileText">
            已读取文件「{{ answerFileName }}」（{{ answerFileText.length }} 字），内容将作为参考答案提交。
          </div>
          <div class="form-tip" v-else>支持 .txt / .md / .csv 文件，按「题号 + 答案」分行，读取后作为文本答案提交。</div>
        </div>

        <div v-if="answerMode === 'image'" style="margin-bottom: 6px">
          <el-upload
            ref="answerUploadRef"
            :auto-upload="false"
            :limit="6"
            accept="image/jpeg,image/png,image/webp,image/bmp,image/gif"
            multiple
            list-type="picture-card"
            :on-change="onAnswerImageChange"
            :on-remove="onAnswerImageChange"
          >
            <el-icon><Plus /></el-icon>
          </el-upload>
          <div class="form-tip">上传写有标准答案的照片（答案卷/教师用书/参考答案页），AI 将据图核对判分。</div>
        </div>
      </div>

      <div style="margin-top: 14px">
        <el-button type="primary" :loading="starting" :disabled="!aiEnabled" @click="startGrading">
          <el-icon><MagicStick /></el-icon>开始批改
        </el-button>
        <el-button type="success" plain :loading="batching" :disabled="!aiEnabled" @click="openBatch">
          <el-icon><DataAnalysis /></el-icon>批量批改整卷
        </el-button>
        <span v-if="!aiEnabled" class="form-tip" style="margin-left: 10px">请先开启并配置 AI 功能</span>
      </div>

      <!-- 批量批改进度面板：整卷批量发起后实时展示进度与结果，支持一键查看/采纳 -->
      <div v-if="batchVisible" class="batch-panel">
        <div class="batch-head">
          <span class="section-title">批量批改进度 · {{ batchExamTitle }}</span>
          <div class="batch-head-actions">
            <el-button
              v-if="batchProgress.pending + batchProgress.running > 0"
              size="small" type="danger" plain
              :loading="batchStopping"
              @click="stopBatch"
            >停止全部（{{ batchProgress.pending + batchProgress.running }}）</el-button>
            <el-button link type="primary" size="small" @click="closeBatch">收起</el-button>
          </div>
        </div>
        <el-progress
          :percentage="batchProgress.percent"
          :status="batchProgress.finished === batchProgress.total && batchProgress.total > 0 ? 'success' : ''"
          style="margin-bottom: 10px"
        />
        <div class="batch-stat">
          <el-tag size="small" type="info">总数 {{ batchProgress.total }}</el-tag>
          <el-tag size="small" type="success">已完成 {{ batchProgress.done }}</el-tag>
          <el-tag size="small" type="warning">批改中 {{ batchProgress.running }}</el-tag>
          <el-tag size="small" type="danger">失败 {{ batchProgress.failed }}</el-tag>
          <el-tag v-if="batchProgress.cancelled > 0" size="small" type="info">已停止 {{ batchProgress.cancelled }}</el-tag>
          <el-tag size="small" type="info">待处理 {{ batchProgress.pending }}</el-tag>
        </div>
        <div v-if="batchProgress.total > 0 && batchProgress.finished === batchProgress.total" class="form-tip">
          本卷批改已全部结束（含失败 / 已停止的任务）。可在下方「批改记录」里逐个查看并采纳到成绩。
        </div>
      </div>
    </el-card>

    <!-- 批改记录 -->
    <el-card shadow="never">
      <template #header>
        <div class="card-title-row">
          <span class="card-title">批改记录</span>
          <el-button size="small" text type="primary" @click="loadTasks()">
            <el-icon><Refresh /></el-icon>刷新
          </el-button>
        </div>
        <!-- 筛选行：学生 / 试卷 / 状态，与积分管理等页面筛选习惯一致；变更后自动回到第一页 -->
        <div class="filter-bar">
          <el-select v-model="filterStudent" placeholder="按学生筛选" clearable filterable style="width: 160px" @change="resetPage">
            <el-option v-for="s in students" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-select v-model="filterExam" placeholder="按试卷筛选" clearable filterable style="width: 200px" @change="resetPage">
            <el-option v-for="e in exams" :key="e.id" :label="e.title" :value="e.id" />
          </el-select>
          <el-select v-model="filterStatus" placeholder="按状态筛选" clearable style="width: 130px" @change="resetPage">
            <el-option label="等待中" value="pending" />
            <el-option label="批改中" value="processing" />
            <el-option label="已完成" value="success" />
            <el-option label="失败" value="failed" />
            <el-option label="已停止" value="cancelled" />
          </el-select>
        </div>
      </template>
      <el-table :data="pagedData" v-loading="tasksLoading" style="width: 100%" empty-text="暂无批改记录">
        <el-table-column prop="student_name" label="学生" width="100" />
        <el-table-column prop="exam_title" label="试卷" min-width="160" show-overflow-tooltip />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status).type" size="small">
              <el-icon v-if="row.status === 'processing'" class="is-loading"><Loading /></el-icon>
              {{ statusTag(row.status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="AI 判分" width="110">
          <template #default="{ row }">
            <span v-if="row.status === 'success'" :class="scoreClass(row.total_score, row.full_score)">
              {{ row.total_score }}<span class="full">/ {{ row.full_score }}</span>
            </span>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="采纳" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.adopted" type="success" size="small">已采纳</el-tag>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="模型" width="150" show-overflow-tooltip />
        <el-table-column prop="created_at" label="批改时间" width="170" />
        <el-table-column label="操作" width="270" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">查看</el-button>
            <el-button
              v-if="isRunning(row)"
              link type="danger" size="small"
              :loading="cancellingId === row.id"
              @click="stopTask(row)"
            >停止</el-button>
            <el-button
              v-if="row.status === 'success'"
              link type="success" size="small"
              @click="openAdopt(row)"
            >采纳</el-button>
            <el-button
              v-if="row.status === 'success'"
              link type="warning" size="small"
              @click="exportDoc(row)"
            >导出</el-button>
            <el-popconfirm title="确定删除该批改记录？" @confirm="removeTask(row)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <!-- 前端分页：与积分管理等页面惯例一致（total + 每页条数 + 页码） -->
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="filtered.length"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 16px; justify-content: flex-end"
      />
    </el-card>

    <!-- 批改详情对话框 -->
    <el-dialog v-model="detailVisible" title="批改详情" width="960px" top="6vh" @closed="onDetailClosed">
      <div v-if="currentTask" class="detail-wrap">
        <div class="detail-head">
          <div class="detail-head-item">
            <span class="label">学生</span><span class="value">{{ currentTask.student_name }}</span>
          </div>
          <div class="detail-head-item">
            <span class="label">试卷</span><span class="value">{{ currentTask.exam_title }}</span>
          </div>
          <div class="detail-head-item">
            <span class="label">模型</span><span class="value">{{ currentTask.model }}</span>
          </div>
          <div class="detail-head-item score-box">
            <span class="label">AI 判分</span>
            <span class="value big" :class="scoreClass(currentTask.total_score, currentTask.full_score)">
              {{ currentTask.status === 'success' ? currentTask.total_score : '—' }}
              <span class="full" v-if="currentTask.status === 'success'">/ {{ currentTask.full_score }}</span>
            </span>
          </div>
        </div>

        <!-- 批改进行中：展示「慢但在动」还是「已经卡住」，并给出一键停止入口。
             只看到「已生成 N 字」是看不出死循环的——字数单调递增，反复吐同一段也在涨；
             而真卡死时旧实现根本不再更新进度，页面数字冻住，同样看不出死活。 -->
        <div v-if="isRunning(currentTask)" class="run-box">
          <el-alert
            :type="progressView.tone" :closable="false" show-icon
            :title="progressView.title"
            :description="progressView.desc"
          />
          <el-button
            class="run-stop" size="small" type="danger" plain
            :loading="cancellingId === currentTask.id"
            @click="stopTask(currentTask)"
          >停止批改</el-button>
        </div>
        <el-alert
          v-else-if="currentTask.status === 'cancelled'"
          type="info" :closable="false" show-icon
          :title="'已停止批改' + (currentTask.error ? '：' + currentTask.error : '')"
          description="本次批改作废、没有写入成绩。图片仍保留在记录里，可以直接重新发起批改。"
          style="margin-bottom: 12px"
        />
        <el-alert
          v-else-if="currentTask.status === 'failed'"
          type="error" :closable="false" show-icon
          :title="'批改失败：' + (currentTask.error || '未知错误')" style="margin-bottom: 12px"
        />

        <!-- 实时输出尾窗：滚动展示模型最近生成的明文片段（约 300 字），最新内容在底部自动滚动。
             用途：字数统计单调递增（反复吐同一段也在涨），只有明文能一眼辨出重复输出与真实进度。
             独立于上方状态提示链（v-if/else-if），仅运行中且有内容时渲染 -->
        <div v-if="progressTail" class="tail-box">
          <div class="tail-head">
            实时输出 · 最近 {{ progressTail.length }} 字 ·
            {{ currentTask.progress && currentTask.progress.stage === 'thinking' ? '思考中' : '作答中' }}
          </div>
          <div ref="tailBodyRef" class="tail-body">{{ progressTail }}</div>
        </div>

        <template v-if="currentTask.status === 'success'">
          <el-alert
            v-if="currentTask.comment && !editing"
            type="success" :closable="false" show-icon
            :title="'总评：' + currentTask.comment" style="margin-bottom: 12px"
          />
          <div class="detail-body">
            <!-- 左栏：原图常驻。右栏题目列表独立滚动，左边图片始终可见，便于对照核对 -->
            <div class="detail-left">
              <div class="section-title">试卷原图（{{ taskImages(currentTask).length }} 张）</div>
              <div class="img-stage">
                <el-image
                  v-if="currentImageSrc"
                  class="stage-img"
                  :src="currentImageSrc"
                  :preview-src-list="imageSrcList"
                  :initial-index="activeImgIndex"
                  fit="contain"
                  preview-teleported
                />
                <el-empty v-else description="无原图" :image-size="60" />
              </div>
              <div v-if="taskImages(currentTask).length > 1" class="img-thumbs">
                <div
                  v-for="(img, i) in taskImages(currentTask)"
                  :key="img"
                  class="thumb"
                  :class="{ active: i === activeImgIndex }"
                  @click="activeImgIndex = i"
                >
                  <img :src="`/uploads/${img}`" />
                </div>
              </div>
            </div>

            <!-- 右栏：逐题批改（只读 / 编辑两种形态） -->
            <div class="detail-right">
              <template v-if="!editing">
                <div class="section-title">逐题批改（{{ detailQuestions.length }} 题）</div>
                <!-- 把握度汇总：把「哪几题最不确定」提前告诉老师，用于决定复核顺序 -->
                <div v-if="confidenceSummary" class="conf-summary">
                  <div class="conf-line">
                    <span>AI 自评把握度：平均 <b>{{ confidenceSummary.avg }}%</b></span>
                    <span class="conf-sub">{{ confidenceSummary.count }}/{{ confidenceSummary.total }} 题给出把握度</span>
                    <el-tooltip
                      v-if="confidenceSummary.lowCount"
                      :content="'把握较低的题号：' + confidenceSummary.lowNos.join('、')"
                      placement="top"
                    >
                      <el-tag type="danger" size="small" effect="plain">把握较低 {{ confidenceSummary.lowCount }} 题</el-tag>
                    </el-tooltip>
                  </div>
                  <div class="form-tip">把握度是 AI 的自评，<b>只反映它对该题结论有多大把握，不代表判分一定准确</b>；低于 60% 的题建议重点核对。</div>
                </div>
                <div class="q-list">
                  <div v-for="(g, gi) in groupedQuestions" :key="g.key" class="q-group">
                    <div v-if="groupedQuestions.length > 1 || g.questions.length > 1" class="q-group-head">
                      <span class="q-group-title">{{ g.title }}</span>
                      <span class="q-group-count">{{ g.questions.length }} 小题</span>
                      <span class="q-group-sum">满分 <b>{{ g.fullSum }}</b> · 得分 <b>{{ g.scoreSum }}</b></span>
                      <el-tag v-if="g.declaredFull > 0 && Math.abs(g.declaredFull - g.fullSum) > 0.01" type="warning" size="small" effect="plain">
                        模型标注满分 {{ g.declaredFull }} ≠ 各小题合计 {{ g.fullSum }}
                      </el-tag>
                    </div>
                    <div v-for="(q, i) in g.questions" :key="i" class="q-item" :class="'q-' + q.result">
                      <div class="q-head">
                        <span class="q-no">第 {{ q.no }} 题</span>
                        <el-tag :type="resultTag(q.result).type" size="small">{{ resultTag(q.result).label }}</el-tag>
                        <el-tooltip v-if="hasConfidence(q)" :content="confidenceTip(q.confidence)" placement="top">
                          <el-tag :type="confidenceTag(q.confidence)" size="small" effect="plain">AI 把握 {{ q.confidence }}%</el-tag>
                        </el-tooltip>
                        <span class="q-score">{{ q.score }} / {{ q.full_score }}</span>
                      </div>
                      <div class="q-row" v-if="q.question"><span class="q-label">题目</span>{{ q.question }}</div>
                      <div class="q-row" v-if="q.student_answer"><span class="q-label">作答</span>{{ q.student_answer }}</div>
                      <div class="q-row q-comment" v-if="q.comment"><span class="q-label">点评</span>{{ q.comment }}</div>
                    </div>
                  </div>
                  <el-empty v-if="!detailQuestions.length" description="模型未返回逐题明细" :image-size="60" />
                </div>
              </template>

              <template v-else>
                <div class="section-title">逐题批改 · 编辑中（{{ editForm.questions.length }} 题）</div>
                <div class="edit-summary">
                  <div class="edit-sum-row">
                    <span class="edit-label">满分</span>
                    <el-input-number v-model="editForm.full_score" :min="0" :max="999" :precision="1" size="small" style="width: 110px" />
                    <span class="edit-label">总分</span>
                    <el-input-number v-model="editForm.total_score" :min="0" :max="999" :precision="1" size="small" style="width: 110px" />
                    <span class="form-tip">
                      逐题合计：<b class="edit-sum">{{ editSum }}</b>
                      <el-button link type="primary" size="small" @click="editForm.total_score = editSum">用合计</el-button>
                    </span>
                  </div>
                  <div class="edit-sum-row">
                    <span class="edit-label">总评</span>
                    <el-input v-model="editForm.overall_comment" type="textarea" :rows="2" placeholder="总体评价（可留空）" />
                  </div>
                </div>
                <div class="q-list">
                  <div v-for="(g, gi) in editGrouped" :key="g.key" class="q-group">
                    <div v-if="editGrouped.length > 1 || g.questions.length > 1" class="q-group-head q-group-head-edit">
                      <span class="q-group-title">{{ g.title }}</span>
                      <span class="q-group-count">{{ g.questions.length }} 小题</span>
                      <span class="q-group-sum">满分 <b>{{ g.fullSum }}</b> · 得分 <b>{{ g.scoreSum }}</b></span>
                    </div>
                    <div v-for="(q, i) in g.questions" :key="i" class="q-item q-edit">
                      <div class="q-head">
                        <el-input v-model="q.no" size="small" style="width: 60px" placeholder="题号" />
                        <el-input v-model="q.group" size="small" style="width: 70px" placeholder="大题号" />
                        <el-select v-model="q.result" size="small" style="width: 110px">
                          <el-option label="正确" value="correct" />
                          <el-option label="部分正确" value="partial" />
                          <el-option label="错误" value="wrong" />
                          <el-option label="未作答" value="blank" />
                        </el-select>
                        <!-- 把握度为 AI 原始自评值，只读展示：编辑时据此决定该题是否要重点核对 -->
                        <el-tooltip v-if="hasConfidence(q)" :content="confidenceTip(q.confidence)" placement="top">
                          <el-tag :type="confidenceTag(q.confidence)" size="small" effect="plain">AI 把握 {{ q.confidence }}%</el-tag>
                        </el-tooltip>
                        <div class="edit-score">
                          <span class="form-tip">得分</span>
                          <el-input-number v-model="q.score" :min="0" :max="999" :precision="1" size="small" style="width: 88px" />
                          <span class="form-tip">满分</span>
                          <el-input-number v-model="q.full_score" :min="0" :max="999" :precision="1" size="small" style="width: 88px" />
                        </div>
                        <el-button link type="danger" size="small" @click="removeEditQuestion(q)">删除</el-button>
                      </div>
                      <div class="q-row"><span class="q-label">题目</span><el-input v-model="q.question" type="textarea" :rows="1" size="small" /></div>
                      <div class="q-row"><span class="q-label">作答</span><el-input v-model="q.student_answer" type="textarea" :rows="1" size="small" /></div>
                      <div class="q-row"><span class="q-label">点评</span><el-input v-model="q.comment" type="textarea" :rows="1" size="small" /></div>
                    </div>
                  </div>
                  <el-empty v-if="!editForm.questions.length" description="暂无题目" :image-size="60" />
                  <el-button style="margin-top: 8px" size="small" plain @click="addEditQuestion">
                    <el-icon><Plus /></el-icon>添加题目
                  </el-button>
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="closeDetail">关闭</el-button>
        <template v-if="currentTask && currentTask.status === 'success'">
          <el-button v-if="!editing" type="primary" plain @click="startEdit">
            <el-icon><Edit /></el-icon>编辑修改
          </el-button>
          <template v-else>
            <el-button @click="editing = false">取消</el-button>
            <el-button type="primary" :loading="savingEdit" @click="saveEdit">
              <el-icon><Check /></el-icon>保存修改
            </el-button>
          </template>
          <el-button v-if="!editing" type="warning" plain @click="exportDoc(currentTask)">
            <el-icon><Download /></el-icon>导出
          </el-button>
          <el-button v-if="!editing" type="success" @click="openAdopt(currentTask)">
            <el-icon><Select /></el-icon>采纳到成绩
          </el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 采纳成绩对话框 -->
    <el-dialog v-model="adoptVisible" title="采纳到成绩" width="480px">
      <el-alert
        type="info" :closable="false" show-icon style="margin-bottom: 14px"
        title="采纳后将写入该生的考试记录，并自动同步到「成绩分析」。请核对分数。"
      />
      <el-form label-width="90px">
        <el-form-item label="AI 判分">
          <span class="adopt-ai">{{ adoptForm.aiTotal }} / {{ adoptForm.aiFull }}</span>
          <el-button v-if="needConvert" link type="primary" size="small" @click="convertTo100">按百分制换算</el-button>
        </el-form-item>
        <el-form-item label="写入成绩">
          <el-input-number v-model="adoptForm.score" :min="0" :max="999" :precision="1" style="width: 100%" />
          <div class="form-tip">默认填入 AI 判定的卷面原始分（与手工录入口径一致）；若成绩分析统一按百分制，可点上方「按百分制换算」。</div>
        </el-form-item>
        <el-form-item label="评语">
          <el-input type="textarea" :rows="3" v-model="adoptForm.comment" placeholder="写入考试记录的评语" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adoptVisible = false">取消</el-button>
        <el-button type="primary" :loading="adopting" @click="submitAdopt">确定采纳</el-button>
      </template>
    </el-dialog>

    <!-- 批量批改预检对话框：列出有照片/无照片学生，勾选要批改的范围 -->
    <el-dialog v-model="batchDialogVisible" title="批量批改整卷" width="640px" top="8vh">
      <el-form :inline="true" style="margin-bottom: 12px">
        <el-form-item label="试卷">
          <el-select v-model="batchForm.exam_id" placeholder="选择试卷" filterable style="width: 320px" @change="loadBatchPreview">
            <el-option v-for="e in exams" :key="e.id" :label="e.title" :value="e.id" />
          </el-select>
        </el-form-item>
      </el-form>

      <div v-if="batchPreviewLoaded" style="margin-bottom: 12px">
        <el-alert
          :type="batchPreview.ready.length ? 'info' : 'warning'"
          :closable="false" show-icon
          :title="`已为该卷录入照片的学生 ${batchPreview.ready.length} 人，可批量批改；无照片 ${batchPreview.noImage.length} 人将跳过`"
        />
      </div>

      <div v-if="batchPreviewLoaded && batchPreview.ready.length" class="batch-select-list">
        <div class="batch-select-head">
          <el-checkbox v-model="batchSelectAll" @change="onBatchSelectAll">全选</el-checkbox>
          <span class="form-tip">勾选要批改的学生（默认全选）</span>
        </div>
        <el-checkbox-group v-model="batchSelectedIds">
          <el-checkbox v-for="s in batchPreview.ready" :key="s.student_id" :value="s.student_id" class="batch-stu">
            {{ s.student_name }}
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <div v-else-if="batchPreviewLoaded" class="form-tip">
        该试卷下没有已录入照片的学生。请先在「试卷管理 → 考试记录」里为学生上传试卷照片。
      </div>

      <div v-if="batchPreviewLoaded && batchPreview.noImage.length" style="margin-top: 12px">
        <div class="form-tip" style="margin-bottom: 4px">以下学生无试卷照片，将被跳过（可关闭此弹窗去补照片）：</div>
        <div class="batch-noimg">
          <el-tag v-for="s in batchPreview.noImage" :key="s.student_id" size="small" type="info" style="margin: 2px">{{ s.student_name }}</el-tag>
        </div>
      </div>

      <template #footer>
        <el-button @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batching" :disabled="!batchSelectedIds.length" @click="confirmBatch">
          批量批改（{{ batchSelectedIds.length }} 人）
        </el-button>
      </template>
    </el-dialog>

    <!-- 模型配置对话框：总开关 + 多供应商管理 -->
    <el-dialog v-model="configVisible" title="AI 模型配置" width="760px" top="6vh">
      <div class="cfg-enabled">
        <span class="cfg-enabled-label">启用 AI 批改</span>
        <el-switch v-model="aiEnabledForm" />
        <span class="form-tip" style="margin-left: 10px">关闭后隐藏批改能力，不影响其它功能</span>
      </div>

      <div class="cfg-upload">
        <span class="section-title">图片压缩（上传前自动处理）</span>
        <div class="cfg-upload-row">
          <span class="form-tip">最长边（像素）：</span>
          <el-input-number v-model="uploadForm.max_edge" :min="512" :max="8192" :step="256" size="small" />
          <span class="form-tip">体积阈值（MB）：</span>
          <el-input-number v-model="uploadForm.threshold_mb" :min="0" :max="50" :step="1" :precision="1" size="small" />
          <span class="form-tip">JPEG 质量：</span>
          <el-input-number v-model="uploadForm.quality" :min="0.3" :max="1" :step="0.05" :precision="2" size="small" />
        </div>
        <div class="form-tip">
          仅对「超过体积阈值」的图片按「最长边」等比缩放并转 JPEG。看图题/图形题对分辨率敏感，可调大最长边（如 3000）或调高体积阈值（如 0 表示不压缩）以保留细节；普通文字卷保持默认即可。
        </div>
      </div>

      <div class="cfg-providers-head">
        <span class="section-title">模型供应商（可添加多个，切换使用）</span>
        <el-button size="small" type="primary" plain @click="openAddProvider">
          <el-icon><Plus /></el-icon>添加供应商
        </el-button>
      </div>

      <el-table :data="aiInfo.providers" size="small" style="width: 100%" empty-text="尚未添加供应商，点击右上角「添加供应商」">
        <el-table-column label="当前使用" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.id === aiInfo.active_id" type="success" size="small" effect="dark">使用中</el-tag>
            <el-button v-else link type="primary" size="small" @click="activateProvider(row)">设为当前</el-button>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="110" show-overflow-tooltip />
        <el-table-column prop="model" label="模型" min-width="140" show-overflow-tooltip />
        <el-table-column label="思考" width="96" align="center">
          <template #default="{ row }">
            <el-tooltip content="点击可在「编辑」中切换思考模式：跟随模型 / 限制思考 / 关闭思考" placement="top">
              <el-tag
                style="cursor: pointer"
                size="small"
                :type="row.thinking_mode === 'suppress' ? 'success' : (row.thinking_mode === 'limited' ? 'warning' : 'info')"
                @click="openEditProvider(row)"
              >{{ row.thinking_mode === 'suppress' ? '已关闭' : (row.thinking_mode === 'limited' ? '限制' : '跟随') }}</el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="base_url" label="服务地址" min-width="180" show-overflow-tooltip />
        <el-table-column label="密钥" width="90" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.api_key_set" size="small" type="info">{{ row.api_key_masked }}</el-tag>
            <span v-else class="text-muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="testSavedProvider(row)">测试</el-button>
            <el-button link type="primary" size="small" @click="openEditProvider(row)">编辑</el-button>
            <el-popconfirm title="确定删除该供应商？" @confirm="removeProvider(row)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="form-tip">「当前使用」为批改时实际调用的供应商，点「设为当前」即时切换；密钥仅存服务端并掩码显示，不下发浏览器。</div>

      <template #footer>
        <el-button @click="configVisible = false">关闭</el-button>
        <el-button type="primary" :loading="savingConfig" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>

    <!-- 供应商编辑子对话框（新增 / 编辑） -->
    <el-dialog
      v-model="providerVisible"
      :title="editingProviderId ? '编辑供应商' : '添加供应商'"
      width="600px" top="8vh" append-to-body
    >
      <el-form :model="providerForm" label-width="100px">
        <el-form-item label="快捷预设">
          <el-select v-model="providerForm.provider" style="width: 100%" @change="onProviderPresetChange">
            <el-option v-for="p in presets" :key="p.key" :label="p.label" :value="p.key" />
          </el-select>
          <div class="form-tip" v-if="currentHint">{{ currentHint }}</div>
        </el-form-item>
        <el-form-item label="供应商名称">
          <el-input v-model="providerForm.name" placeholder="便于识别的名称，如 DeepSeek 官方 / 内网中转" />
        </el-form-item>
        <el-form-item label="服务地址">
          <el-input v-model="providerForm.base_url" placeholder="如 https://api.deepseek.com" />
          <div class="form-tip">OpenAI 兼容 base_url，系统自动拼接 /chat/completions；本地服务（LM Studio / Ollama / vLLM）通常需以 /v1 结尾，遗漏时系统会自动兜底重试</div>
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="providerForm.api_key"
            type="password"
            show-password
            :placeholder="providerForm.api_key_set ? `已配置 ${providerForm.api_key_masked}，留空则不修改` : '请输入 API Key（本地模型可留空）'"
          />
        </el-form-item>
        <el-form-item label="模型名称">
          <el-input v-model="providerForm.model" placeholder="如 deepseek-v4-flash-vision-exp / qwen-vl-max" />
        </el-form-item>
        <el-form-item label="多模态">
          <el-switch v-model="providerForm.multimodal" />
          <span class="form-tip" style="margin-left: 10px">批改试卷需读取图片，请保持开启</span>
        </el-form-item>
        <el-form-item label="温度">
          <el-input-number v-model="providerForm.temperature" :min="0" :max="2" :step="0.1" :precision="1" />
          <span class="form-tip" style="margin-left: 10px">越低越稳定，批改建议 0~0.3</span>
        </el-form-item>
        <el-form-item label="流式响应">
          <el-switch v-model="providerForm.stream" />
          <span class="form-tip" style="margin-left: 10px">开启后批改中实时显示「思考中/作答中，已生成 N 字」，并以「空闲超时」守护——慢速推理模型批改长卷也不会被误判超时（推荐开启）</span>
        </el-form-item>
        <el-form-item label="限制 Tokens">
          <el-switch v-model="providerForm.limit_tokens" />
          <el-input-number
            v-if="providerForm.limit_tokens"
            v-model="providerForm.max_tokens" :min="256" :max="32000" :step="256" style="margin-left: 10px"
          />
          <div class="form-tip">
            {{ providerForm.limit_tokens
              ? '限制模型最多生成的 Tokens；推理型模型的思考过程也占用此额度，批改整卷建议 16000 以上'
              : '不限制：不下发 max_tokens，由模型按自身上下文上限自由生成（推荐，尤其推理型模型——避免思考占满额度导致答案被截断）。云端按量计费时可开启限制以控制成本' }}
          </div>
        </el-form-item>
        <el-form-item label="思考模式">
          <el-radio-group v-model="providerForm.thinking_mode" size="small">
            <el-radio-button value="default">跟随模型</el-radio-button>
            <el-radio-button value="limited">限制思考</el-radio-button>
            <el-radio-button value="suppress">关闭思考</el-radio-button>
          </el-radio-group>
          <div v-if="providerForm.thinking_mode !== 'default'" style="margin-top: 6px">
            <span class="form-tip">思考上限（字，0 = 不限制）：</span>
            <el-input-number v-model="providerForm.reasoning_limit" :min="0" :max="200000" :step="1000" size="small" />
          </div>
          <div class="form-tip">
            {{ providerForm.thinking_mode === 'suppress'
              ? '关闭思考（推荐，尤其推理型模型）：同时下发 enable_thinking=false 等多套厂商开关（覆盖 Qwen / OpenAI / Gemini / Claude 系命名），并追加简洁作答指令。实测整卷批改从「6 分钟仍不输出正文」降到 44 秒拿到完整结果。个别服务端若不认识某个扩展参数，会自动去掉后重发，不影响批改'
              : providerForm.thinking_mode === 'limited'
                ? '限制思考：允许模型思考，但思考超过上限字数仍未作答即中止；中止后若思考中没有可用答案，会自动改用「关闭思考」重试一次，不会白等一场。适合想保留推理质量、又不希望无限空转的场景'
                : '跟随模型：完全不干预思考。注意：此模式下「思考上限」不生效（填了也不会被执行）——推理型模型常会持续思考数分钟仍不输出正文，实测同一张卷改用「关闭思考」只需 40 秒级即可出结果。建议只在确认模型不会陷入长思考时才使用' }}
          </div>
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input
            type="textarea" :rows="5" v-model="providerForm.system_prompt"
            placeholder="留空则使用内置批改提示词"
          />
          <el-button link type="primary" size="small" @click="restoreDefaultPrompt">恢复默认提示词</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :loading="testing" @click="testConn">
          <el-icon><Connection /></el-icon>测试连接
        </el-button>
        <el-button @click="providerVisible = false">取消</el-button>
        <el-button type="primary" :loading="providerSaving" @click="saveProvider">保存供应商</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getAiPresets, getAiConfig, saveAiConfig, testAiConnection,
  addAiProvider, updateAiProvider, deleteAiProvider, activateAiProvider, testAiProvider,
  getAiTasks, createAiTask, createAiBatchTask, getAiTask, adoptAiTask, editAiTaskResult, deleteAiTask, exportAiTask,
  cancelAiTask, cancelAiBatchTask,
  getExams, getStudents, getExamAnswerRef, saveExamAnswerRef, getExamRecords
} from '../../api'

// ---------- 状态 ----------
const aiInfo = ref({ enabled: false, providers: [], active_id: '' })
const presets = ref([])
const defaultPrompt = ref('')
const exams = ref([])
const students = ref([])
const tasks = ref([])

// ---------- 批改记录：筛选 + 前端分页（与积分管理等页面惯例一致） ----------
// 筛选条件：学生 / 试卷 / 状态；仅影响表格展示，不改动轮询与批量进度统计（二者仍基于全量 tasks）
const filterStudent = ref(null)
const filterExam = ref(null)
const filterStatus = ref(null)
const currentPage = ref(1)
const pageSize = ref(20)

// 筛选结果（未选中任何条件时等于全量列表）
const filtered = computed(() => tasks.value.filter(t =>
  (!filterStudent.value || t.student_id === filterStudent.value) &&
  (!filterExam.value || t.exam_id === filterExam.value) &&
  (!filterStatus.value || t.status === filterStatus.value)
))

// 当前页数据切片（表格数据源）
const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

// 筛选条件变化时重置回第一页，避免停留在超出的空页
const resetPage = () => { currentPage.value = 1 }

const tasksLoading = ref(false)
const starting = ref(false)

const aiEnabled = computed(() => aiInfo.value.enabled)
// 当前使用的供应商（激活项），顶部状态栏与批改均以此为准
const activeProvider = computed(() =>
  (aiInfo.value.providers || []).find(p => p.id === aiInfo.value.active_id) || null
)
const configSummary = computed(() => {
  const a = activeProvider.value
  if (!a) return '未配置供应商'
  return `${a.name}${a.model ? ' · ' + a.model : ''}`
})

// ---------- 发起批改 ----------
const newForm = ref({ exam_id: null, student_id: null })
const uploadRef = ref()
const imageFiles = ref([])

// ---------- 标准答案（参考答案） ----------
const answerMode = ref('none') // none / text / file / image
const answerText = ref('')
const answerUploadRef = ref()
const answerImageFiles = ref([])
const answerFileRef = ref()
const answerFileText = ref('')
const answerFileName = ref('')
const storedAnswer = ref(null) // 试卷级已存答案（answer_ref）

// 是否已有已存答案（用于顶部提示与「清空」按钮）
const hasStoredAnswer = computed(() => {
  const a = storedAnswer.value
  if (!a) return false
  if (a.mode === 'text' && a.text && a.text.trim()) return true
  if (a.mode === 'image' && Array.isArray(a.images) && a.images.length) return true
  return false
})
// 已存答案摘要（用于提示文案）
const storedAnswerSummary = computed(() => {
  const a = storedAnswer.value
  if (!a) return ''
  if (a.mode === 'text') {
    const n = a.text ? String(a.text).split('\n').filter(l => l.trim()).length : 0
    return `文本 ${n} 行`
  }
  if (a.mode === 'image') return `图片 ${(a.images || []).length} 张`
  return ''
})

const onAnswerImageChange = (file, uploadFiles) => {
  answerImageFiles.value = (uploadFiles || []).map(f => f.raw).filter(Boolean)
}

// 答案文件：读取 .txt/.md/.csv 文本内容，作为「文本答案」提交（前端读内容、后端走文本通道，零新增后端复杂度）
const onAnswerFileChange = (file, uploadFiles) => {
  const list = (uploadFiles || []).map(f => f.raw).filter(Boolean)
  if (!list.length) {
    answerFileText.value = ''
    answerFileName.value = ''
    return
  }
  const f = list[0]
  if (f.size > 2 * 1024 * 1024) {
    ElMessage.warning('答案文件不能超过 2MB')
    answerFileRef.value?.clearFiles()
    answerFileText.value = ''
    answerFileName.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    answerFileText.value = String(reader.result || '')
    answerFileName.value = f.name || ''
  }
  reader.onerror = () => {
    ElMessage.error('文件读取失败，请重试或改用文本输入')
    answerFileText.value = ''
    answerFileName.value = ''
  }
  reader.readAsText(f, 'utf-8')
}

// 选择试卷后加载该试卷已存答案
const onExamChange = async (examId) => {
  storedAnswer.value = null
  if (!examId) return
  try {
    const r = await getExamAnswerRef(examId)
    storedAnswer.value = (r && r.answer_ref) || null
  } catch (e) { /* 拦截器已提示 */ }
}

// 清空已存答案
const clearAnswer = async () => {
  if (!newForm.value.exam_id) return
  try {
    await saveExamAnswerRef(newForm.value.exam_id, null)
    storedAnswer.value = null
    ElMessage.success('已清空该试卷的参考答案')
  } catch (e) { /* 拦截器已提示 */ }
}

const onImageChange = (file, uploadFiles) => {
  imageFiles.value = (uploadFiles || []).map(f => f.raw).filter(Boolean)
}

// 大图压缩：手机拍的试卷单张常达 5~8MB，转 base64 后还要再膨胀约 1/3，
// 会明显拉长模型的视觉编码时间（多图时首字节等待可达数分钟）并推高内存占用。
// 只对「长边超标」的 JPEG/PNG/WEBP 缩放——手写小字对分辨率敏感，不能一刀切压小；
// 任何一步异常或压缩后反而更大，都回退原图，保证图片数量与顺序完全不变。
// 压缩参数（最长边 / 质量）来自「AI 模型配置」的全局图片压缩设置，可随时调整；
// 看图/图形题对分辨率敏感，可调大最长边以保留更多细节。
// 注：threshold_mb 仍随配置下发，但仅作展示与历史兼容，不再作为「跳过压缩」的唯一门槛
//     （只按体积判断会漏掉「体积不大、长边却严重超标」的图，见 compressImage 内注释）。
const uploadSettings = computed(() => {
  const u = aiInfo.value?.upload
  return {
    max_edge: Number(u?.max_edge) > 0 ? Number(u.max_edge) : 2048,
    threshold_mb: Number(u?.threshold_mb) >= 0 ? Number(u.threshold_mb) : 3,
    quality: Number(u?.quality) > 0 ? Number(u.quality) : 0.9
  }
})
const compressImage = (file) => new Promise((resolve) => {
  const fallback = () => resolve(file)
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) return fallback()
    const { max_edge, quality } = uploadSettings.value
    if (!file.size) return fallback()
    // 注意：这里**不能**按体积提前跳过。旧实现是「file.size <= threshold_mb 就原样上传」，
    // 于是 4000×1846 / 2.5MB 这种「体积不大、但长边严重超标」的试卷图会直接发给模型，
    // 视觉 token 约为压缩后的 3 倍，明显拖慢首字节等待与整卷批改时间。
    // 长边是否超标必须读到图片尺寸才知道，故统一放到 onload 里判断。
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const w = img.naturalWidth || 0
        const h = img.naturalHeight || 0
        if (!w || !h) { URL.revokeObjectURL(url); return fallback() }
        const scale = Math.min(1, max_edge / Math.max(w, h))
        // 长边本来就没超标：不重绘，避免无谓的画质损失（体积由上传接口把关：单张 10MB、合计 40MB）
        if (scale >= 1) { URL.revokeObjectURL(url); return fallback() }
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(w * scale)
        canvas.height = Math.round(h * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url)
          if (!blob || blob.size >= file.size) return fallback()
          const name = String(file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg'
          resolve(new File([blob], name, { type: 'image/jpeg' }))
        }, 'image/jpeg', quality)
      } catch (e) {
        URL.revokeObjectURL(url)
        fallback()
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); fallback() }
    img.src = url
  } catch (e) {
    fallback()
  }
})

const startGrading = async () => {
  if (!newForm.value.exam_id) return ElMessage.warning('请选择试卷')
  if (!newForm.value.student_id) return ElMessage.warning('请选择学生')
  starting.value = true
  try {
    const fd = new FormData()
    fd.append('exam_id', newForm.value.exam_id)
    fd.append('student_id', newForm.value.student_id)
    // 上传前压缩超大图；顺序与原数组一致，页序不会乱
    const files = []
    for (const f of imageFiles.value) files.push(await compressImage(f))
    files.forEach(f => fd.append('images', f))
    // 标准答案：文本 / 文件（前端读文本）/ 图片（均可同传，后端合并；均未提供则复用试卷级已存答案）
    const finalAnswerText = answerMode.value === 'file' ? answerFileText.value : answerText.value
    if ((answerMode.value === 'text' || answerMode.value === 'file') && finalAnswerText.trim()) {
      fd.append('answer_text', finalAnswerText)
    }
    if (answerMode.value === 'image' && answerImageFiles.value.length) {
      const ansFiles = []
      for (const f of answerImageFiles.value) ansFiles.push(await compressImage(f))
      ansFiles.forEach(f => fd.append('answer_images', f))
    }
    const r = await createAiTask(fd)
    ElMessage.success('已提交批改，AI 正在处理…')
    uploadRef.value?.clearFiles()
    imageFiles.value = []
    answerUploadRef.value?.clearFiles()
    answerImageFiles.value = []
    answerFileRef.value?.clearFiles()
    answerFileText.value = ''
    answerFileName.value = ''
    await loadTasks()
    // 打开详情并轮询进度
    const created = tasks.value.find(t => t.id === r.id)
    if (created) viewDetail(created)
    startPolling()
  } catch (e) {
    // 拦截器已提示
  } finally {
    starting.value = false
  }
}

// ---------- 批量批改 ----------
const batchDialogVisible = ref(false)
const batching = ref(false)
const batchForm = ref({ exam_id: null })
const batchPreviewLoaded = ref(false)
const batchPreview = ref({ ready: [], noImage: [] }) // ready: {student_id, student_name}[]; noImage 同理
const batchSelectedIds = ref([])
const batchSelectAll = ref(true)
const batchVisible = ref(false)          // 进度面板是否显示
const batchExamTitle = ref('')
const batchTaskIds = ref([])             // 本次批量创建的任务 id 集合（用于进度统计，刷新后按 exam 兜底）
const batchStopping = ref(false)         // 「停止全部」请求进行中

// 打开批量预检：先选试卷，再拉该卷考试记录判断哪些学生有照片
const openBatch = () => {
  batchForm.value.exam_id = newForm.value.exam_id || null
  batchPreviewLoaded.value = false
  batchPreview.value = { ready: [], noImage: [] }
  batchSelectedIds.value = []
  batchDialogVisible.value = true
  if (batchForm.value.exam_id) loadBatchPreview()
}
const loadBatchPreview = async () => {
  const examId = batchForm.value.exam_id
  batchPreviewLoaded.value = false
  if (!examId) return
  try {
    const records = await getExamRecords(examId)
    const ready = []
    const noImage = []
    for (const r of (records || [])) {
      const hasImg = !!(r.image_path && r.image_path.trim())
      const item = { student_id: r.student_id, student_name: r.student_name || `学生${r.student_id}` }
      if (hasImg) ready.push(item)
      else noImage.push(item)
    }
    batchPreview.value = { ready, noImage }
    batchSelectedIds.value = ready.map(s => s.student_id)
    batchSelectAll.value = true
    batchPreviewLoaded.value = true
  } catch (e) {
    // 拦截器已提示
  }
}
const onBatchSelectAll = (val) => {
  batchSelectedIds.value = val ? batchPreview.value.ready.map(s => s.student_id) : []
}
const confirmBatch = async () => {
  if (!batchForm.value.exam_id) return ElMessage.warning('请选择试卷')
  if (!batchSelectedIds.value.length) return ElMessage.warning('请至少勾选一名学生')
  batching.value = true
  try {
    const r = await createAiBatchTask({ exam_id: batchForm.value.exam_id, student_ids: batchSelectedIds.value })
    batchDialogVisible.value = false
    const exam = exams.value.find(e => e.id === batchForm.value.exam_id)
    batchExamTitle.value = exam ? exam.title : ''
    batchTaskIds.value = r.task_ids || []
    batchVisible.value = true
    // 组装提示
    const parts = [`已发起 ${r.created} 份批改`]
    if (r.skipped_no_image && r.skipped_no_image.length) parts.push(`${r.skipped_no_image.length} 人无照片已跳过`)
    if (r.skipped_running && r.skipped_running.length) parts.push(`${r.skipped_running.length} 人已在批改中`)
    ElMessage.success(parts.join('，'))
    await loadTasks()
    startPolling()
  } catch (e) {
    // 拦截器已提示
  } finally {
    batching.value = false
  }
}
const closeBatch = () => {
  batchVisible.value = false
  batchTaskIds.value = []
}
// 一键停止整批：并发队列是「停掉当前这个、排在后面的立刻接上开跑」，
// 因此逐个停止在批量场景下等于停不下来（老师会感觉点了停止却还在跑）。
// 这里把整批（正在跑的 + 排队中的）一次停掉。
const stopBatch = async () => {
  const waiting = batchProgress.value.pending + batchProgress.value.running
  if (!waiting) return
  try {
    await ElMessageBox.confirm(
      `将停止 ${waiting} 个尚未完成的批改任务（正在批改的和排队等待的都会停止）。停止后本次结果作废，不会写入成绩；试卷图片仍保留，随时可以重新发起批改。确定停止吗？`,
      '停止全部批改',
      { type: 'warning', confirmButtonText: '全部停止', cancelButtonText: '继续等待' }
    )
  } catch (e) {
    return
  }
  batchStopping.value = true
  try {
    // 传 task_ids 精确限定本批；若 ids 已丢失（如发起后刷新过页面）则退化为「停止当前库全部在跑的批改」
    const r = await cancelAiBatchTask(batchTaskIds.value)
    ElMessage.success(r && r.stopped ? `已停止 ${r.stopped} 个批改任务` : '已停止批改')
    await loadTasks()
  } catch (e) {
    // 拦截器已提示
  } finally {
    batchStopping.value = false
  }
}
// 整卷进度统计：优先按本次批量创建的 task_ids 过滤，否则按当前试卷过滤
const batchProgress = computed(() => {
  let list = tasks.value
  if (batchTaskIds.value.length) {
    const set = new Set(batchTaskIds.value)
    list = tasks.value.filter(t => set.has(t.id))
  }
  const total = list.length
  const done = list.filter(t => t.status === 'success').length
  const failed = list.filter(t => t.status === 'failed').length
  // 「已停止」也是终态：必须从「待处理」里扣除，否则老师主动停掉的任务会被永远算作未处理，
  // 进度条也永远到不了 100%
  const cancelled = list.filter(t => t.status === 'cancelled').length
  const running = list.filter(t => t.status === 'processing' || t.status === 'pending').length
  const pending = Math.max(0, total - done - failed - cancelled - running)
  const finished = done + failed + cancelled
  const percent = total > 0 ? Math.round((finished / total) * 100) : 0
  return { total, done, failed, cancelled, running, pending, finished, percent }
})

// ---------- 任务列表与轮询 ----------
const notified = new Set()
let pollTimer = null

const loadTasks = async (silent = false) => {
  if (!silent) tasksLoading.value = true
  try {
    const before = new Map(tasks.value.map(t => [t.id, t.status]))
    const rows = await getAiTasks({})
    tasks.value = rows || []
    // 新完成的批改给出一次提示
    tasks.value.forEach(t => {
      if (t.status === 'success' && before.get(t.id) && before.get(t.id) !== 'success' && !notified.has(t.id)) {
        notified.add(t.id)
        ElMessage.success(`${t.student_name} 的试卷批改完成`)
      }
      if (t.status === 'failed' && before.get(t.id) && before.get(t.id) !== 'failed' && !notified.has('f' + t.id)) {
        notified.add('f' + t.id)
        ElMessage.error(`${t.student_name} 的试卷批改失败`)
      }
    })
  } catch (e) {
    // 拦截器已提示
  } finally {
    tasksLoading.value = false
  }
}

const startPolling = () => {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    const hasPending = tasks.value.some(t => t.status === 'pending' || t.status === 'processing')
    if (hasPending) loadTasks(true)
    else stopPolling()
  }, 2500)
}
const stopPolling = () => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ---------- 详情 ----------
const detailVisible = ref(false)
const currentTask = ref(null)
let detailTimer = null

const detailQuestions = computed(() => {
  const d = currentTask.value?.detail
  return d && Array.isArray(d.questions) ? d.questions : []
})
const taskImages = (t) => (t && t.image_path ? t.image_path.split(',').filter(Boolean) : [])

// 把扁平 questions 按「大题」分组：优先用模型给的 group 字段，回退 no 的「大题号-小题号」前缀解析。
// 每组汇总：大题满分 = 各小题 full_score 之和，得分 = 各小题 score 之和（可靠，不依赖模型自报的大题分）；
// declaredFull 为模型标注的大题满分（可能不准），与求和不符时用于展示「分值有误」提示。
const groupQuestions = (list) => {
  const groups = []
  const map = new Map()
  for (const q of (list || [])) {
    let key = (q.group || '').trim()
    if (!key) {
      const m = String(q.no || '').match(/^\s*(.+?)\s*[-.、·(（]\s*\d/)
      key = m ? m[1].trim() : (String(q.no || '').trim() || '未分组')
    }
    if (!map.has(key)) {
      const g = { key, title: key, questions: [], fullSum: 0, scoreSum: 0, declaredFull: 0 }
      map.set(key, g)
      groups.push(g)
    }
    const g = map.get(key)
    g.questions.push(q)
    g.fullSum = Math.round((g.fullSum + (Number(q.full_score) || 0)) * 100) / 100
    g.scoreSum = Math.round((g.scoreSum + (Number(q.score) || 0)) * 100) / 100
    if (!g.declaredFull && Number(q.group_full_score) > 0) g.declaredFull = Number(q.group_full_score)
  }
  return groups
}
const groupedQuestions = computed(() => groupQuestions(detailQuestions.value))
// 编辑态分组（editForm.questions 是扁平数组，同样按大题聚合并实时汇总）
const editGrouped = computed(() => groupQuestions(editForm.value.questions))

// 把握度汇总：AI 每题自评的把握程度（0~100）。只统计确有数值的题——
// 模型未返回（例如老师自定义了提示词）或老任务无该字段时返回 null，整个区块不展示，
// 不用 0 兜底（凭空给一个数会误导复核判断）。
const confidenceSummary = computed(() => {
  const all = detailQuestions.value || []
  const list = all.filter(q => typeof q.confidence === 'number')
  if (!list.length) return null
  const avg = Math.round(list.reduce((s, q) => s + q.confidence, 0) / list.length)
  const low = list.filter(q => q.confidence < 60)
  return {
    avg,
    count: list.length,
    total: all.length,
    lowCount: low.length,
    lowNos: low.map(q => q.no).filter(Boolean)
  }
})

// 原图常驻：左栏单图舞台 + 缩略图切换；右栏题目滚动时左边图片始终可见
const activeImgIndex = ref(0)
const imageSrcList = computed(() => taskImages(currentTask.value).map(x => `/uploads/${x}`))
const currentImageSrc = computed(() => imageSrcList.value[activeImgIndex.value] || '')

const closeDetail = () => {
  detailVisible.value = false
}
const onDetailClosed = () => {
  stopDetailPolling()
  editing.value = false
  activeImgIndex.value = 0
}

// ---------- 手工编辑 ----------
const editing = ref(false)
const savingEdit = ref(false)
const editForm = ref({ total_score: 0, full_score: 0, overall_comment: '', questions: [] })
const editSum = computed(() => {
  const s = (editForm.value.questions || []).reduce((sum, q) => sum + (Number(q.score) || 0), 0)
  return Math.round(s * 100) / 100
})
const startEdit = () => {
  const d = currentTask.value?.detail
  const qs = d && Array.isArray(d.questions) ? d.questions : []
  editForm.value = {
    total_score: Number(currentTask.value?.total_score ?? 0),
    full_score: Number(currentTask.value?.full_score ?? 0),
    overall_comment: currentTask.value?.comment || '',
    questions: qs.map(q => ({ ...q }))
  }
  editing.value = true
}
const addEditQuestion = () => {
  editForm.value.questions.push({
    no: '', group: '', group_full_score: 0, question: '', student_answer: '', score: 0, full_score: 0, result: 'unknown', confidence: null, comment: ''
  })
}
const removeEditQuestion = (q) => {
  const i = editForm.value.questions.indexOf(q)
  if (i >= 0) editForm.value.questions.splice(i, 1)
}
const saveEdit = async () => {
  if (!currentTask.value) return
  savingEdit.value = true
  try {
    await editAiTaskResult(currentTask.value.id, {
      total_score: editForm.value.total_score,
      full_score: editForm.value.full_score,
      overall_comment: editForm.value.overall_comment,
      questions: editForm.value.questions
    })
    ElMessage.success('已保存修改，可点「采纳到成绩」写入考试记录')
    editing.value = false
    await refreshDetail(currentTask.value.id)
    await loadTasks(true)
  } catch (e) {
    // 拦截器已提示
  } finally {
    savingEdit.value = false
  }
}

const viewDetail = async (row) => {
  activeImgIndex.value = 0
  editing.value = false
  detailVisible.value = true
  await refreshDetail(row.id)
  if (currentTask.value && ['pending', 'processing'].includes(currentTask.value.status)) {
    startDetailPolling(row.id)
  }
}
const refreshDetail = async (id) => {
  try {
    currentTask.value = await getAiTask(id)
  } catch (e) { /* 拦截器已提示 */ }
}
const startDetailPolling = (id) => {
  stopDetailPolling()
  detailTimer = setInterval(async () => {
    await refreshDetail(id)
    const st = currentTask.value?.status
    if (st && !['pending', 'processing'].includes(st)) {
      stopDetailPolling()
      loadTasks(true)
    }
  }, 2500)
}
const stopDetailPolling = () => {
  if (detailTimer) { clearInterval(detailTimer); detailTimer = null }
}

// ---------- 进度解读 / 主动停止 ----------
// 进度文案由后端算好（stalled_seconds / repeating 均是服务端权威值），前端只做解读与分级：
//   · 停滞 30s 起提示、60s 起转为警示色 —— 但长思考/多图视觉编码本来就会几十秒不出字，
//     所以只是提示，不谎报「卡死」；
//   · 疑似重复输出只在后端判定命中时提示，且措辞是「疑似」——启发式检测允许误报，
//     要不要停由老师决定，平台不擅自掐断（项目历史上已被过早中断坑过）。
const cancellingId = ref(null)

const progressView = computed(() => {
  const t = currentTask.value
  if (!t) return { tone: 'info', title: '', desc: '' }
  const p = t.progress || {}
  // 排队中（还没轮到）：后端此时不会上报进度，需要单独说明，避免老师以为卡住了
  if (t.status === 'pending' && !p.stage) {
    return {
      tone: 'info',
      title: '已加入批改队列，等待前面的任务完成…',
      desc: '为避免多个任务同时抢占显存，批改按顺序逐个执行。若不想再等，可点右侧「停止批改」取消本次任务。'
    }
  }
  const stalled = Number(p.stalled_seconds || 0)
  const idleLimit = Math.round((Number(p.idle_limit_seconds) || 300) / 60)
  const totalLimit = Math.round((Number(p.total_limit_seconds) || 2700) / 60)
  const notes = []
  if (stalled >= 30) notes.push(`已 ${stalled} 秒没有新输出`)
  if (p.repeating) notes.push(`疑似重复输出（同一段内容已出现 ${p.repeat_hits} 次）`)
  const descBits = []
  if (p.chars) descBits.push(`累计生成 ${p.chars} 字`)
  descBits.push(`已用时 ${p.elapsed_seconds || 0} 秒`)
  descBits.push(`平台守护：连续 ${idleLimit} 分钟无输出、或累计 ${totalLimit} 分钟会自动停止`)
  descBits.push('批改期间请勿关闭页面')
  return {
    tone: p.repeating || stalled >= 60 ? 'warning' : 'info',
    title: (p.text || 'AI 正在批改中，请稍候…') + (notes.length ? `　⚠︎ ${notes.join('；')}` : ''),
    desc: descBits.join('　·　')
  }
})

// ---------- 实时输出尾窗 ----------
// 当前阶段最近约 300 字明文（后端已截断）：运行中任务的详情弹窗里滚动展示，
// 老师可肉眼判断「模型在写什么、是否在重复」；非运行中一律为空（不渲染）
const progressTail = computed(() => {
  const t = currentTask.value
  if (!t || !isRunning(t)) return ''
  return String((t.progress && t.progress.tail_text) || '')
})

const tailBodyRef = ref(null)
// 尾窗内容更新时自动滚动到底部：最新的生成内容始终可见，旧内容向上滚出
watch(progressTail, async () => {
  await nextTick()
  const el = tailBodyRef.value
  if (el) el.scrollTop = el.scrollHeight
})

const stopTask = async (task) => {
  if (!task || !isRunning(task)) return
  try {
    await ElMessageBox.confirm(
      '停止后本次批改作废，已生成的内容不会保留，也不会写入成绩（试卷图片仍在记录里，随时可以重新发起批改）。确定停止吗？',
      '停止批改',
      { type: 'warning', confirmButtonText: '停止批改', cancelButtonText: '继续等待' }
    )
  } catch (e) {
    return // 用户取消
  }
  cancellingId.value = task.id
  try {
    await cancelAiTask(task.id)
    ElMessage.success('已停止批改')
    await loadTasks(true)
    if (currentTask.value && currentTask.value.id === task.id) {
      await refreshDetail(task.id)
      // 后端落库「已停止」可能在响应之后几毫秒才完成：此刻仍是终态才停轮询，
      // 否则保留轮询让它自然收敛（状态转为终态时会自行停止），避免界面卡在「批改中」
      if (!isRunning(currentTask.value)) stopDetailPolling()
    }
  } catch (e) {
    // 拦截器已提示
  } finally {
    cancellingId.value = null
  }
}

// ---------- 采纳 ----------
const adoptVisible = ref(false)
const adopting = ref(false)
const adoptForm = ref({ id: null, score: 0, comment: '', aiTotal: 0, aiFull: 0 })
const needConvert = computed(() => {
  const f = Number(adoptForm.value.aiFull)
  return f && f !== 100
})

// 默认写入卷面原始分，与「考试记录」手工录入 / Excel 导入口径一致，避免同一考试下
// 成绩分析混入百分制换算分导致均分/趋势失真；满分非 100 时老师可显式点击换算按钮
const defaultAdoptScore = (task) => Math.round(Number(task.total_score || 0) * 10) / 10
const openAdopt = (task) => {
  adoptForm.value = {
    id: task.id,
    score: defaultAdoptScore(task),
    comment: task.comment || '',
    aiTotal: task.total_score,
    aiFull: task.full_score
  }
  adoptVisible.value = true
}
const convertTo100 = () => {
  const total = Number(adoptForm.value.aiTotal || 0)
  const full = Number(adoptForm.value.aiFull || 0)
  if (full) adoptForm.value.score = Math.round((total / full) * 100 * 10) / 10
}
const submitAdopt = async () => {
  adopting.value = true
  try {
    await adoptAiTask(adoptForm.value.id, { score: adoptForm.value.score, comment: adoptForm.value.comment })
    ElMessage.success('已采纳并同步到成绩分析')
    adoptVisible.value = false
    await loadTasks(true)
    if (currentTask.value && currentTask.value.id === adoptForm.value.id) {
      await refreshDetail(currentTask.value.id)
    }
  } catch (e) {
    // 拦截器已提示
  } finally {
    adopting.value = false
  }
}

// ---------- 导出 / 删除 ----------
const exportDoc = async (task) => {
  try {
    const blob = await exportAiTask(task.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${task.exam_title || '试卷'}_${task.student_name || '学生'}_AI批改.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('批改文档已导出')
  } catch (e) { /* 拦截器已提示 */ }
}
const removeTask = async (task) => {
  try {
    await deleteAiTask(task.id)
    ElMessage.success('已删除')
    if (currentTask.value && currentTask.value.id === task.id) detailVisible.value = false
    await loadTasks(true)
  } catch (e) { /* 拦截器已提示 */ }
}

// ---------- 配置：总开关 + 多供应商管理 ----------
const configVisible = ref(false)
const savingConfig = ref(false)
const aiEnabledForm = ref(false)
// 图片压缩（全局）表单：最长边 / 体积阈值 / JPEG 质量
const uploadForm = ref({ max_edge: 2048, threshold_mb: 3, quality: 0.9 })

// 供应商编辑子弹窗
const providerVisible = ref(false)
const providerSaving = ref(false)
const testing = ref(false)
const providerForm = ref({})
const editingProviderId = ref(null) // null = 新增
const currentHint = computed(() => {
  const p = presets.value.find(x => x.key === providerForm.value.provider)
  return p ? p.hint : ''
})
// 预设显示名去掉「（默认）/（官方）」等后缀，作为供应商名默认值
const presetShortName = (label) => String(label || '').replace(/（.*?）/g, '').trim()

const loadConfig = async () => {
  try { aiInfo.value = await getAiConfig() } catch (e) { /* 拦截器已提示 */ }
}
const openConfig = async () => {
  await loadConfig()
  aiEnabledForm.value = !!aiInfo.value.enabled
  const u = aiInfo.value.upload || {}
  uploadForm.value = {
    max_edge: Number(u.max_edge) > 0 ? Number(u.max_edge) : 2048,
    threshold_mb: Number(u.threshold_mb) >= 0 ? Number(u.threshold_mb) : 3,
    quality: Number(u.quality) > 0 ? Number(u.quality) : 0.9
  }
  configVisible.value = true
}
// 保存总开关 + 图片压缩设置（当前激活供应商在切换时已即时保存）
const saveConfig = async () => {
  savingConfig.value = true
  try {
    await saveAiConfig({ enabled: aiEnabledForm.value, active_id: aiInfo.value.active_id, upload: uploadForm.value })
    ElMessage.success('已保存')
    configVisible.value = false
    await loadConfig()
  } catch (e) { /* 拦截器已提示 */ } finally {
    savingConfig.value = false
  }
}
// 切换当前使用的供应商
const activateProvider = async (p) => {
  try {
    await activateAiProvider(p.id)
    ElMessage.success(`已切换到「${p.name}」`)
    await loadConfig()
  } catch (e) { /* 拦截器已提示 */ }
}
// 新增供应商：默认预选首个预设（DeepSeek）
const openAddProvider = () => {
  editingProviderId.value = null
  const preset = presets.value[0] || {}
  providerForm.value = {
    name: presetShortName(preset.label),
    provider: preset.key || 'deepseek',
    base_url: preset.base_url || '',
    api_key: '',
    api_key_set: false,
    api_key_masked: '',
    model: preset.model || '',
    multimodal: preset.multimodal !== false,
    temperature: 0.1,
    stream: true,          // 默认开启流式：实时进度 + 避免长等待超时
    limit_tokens: false,   // 默认不限制输出长度（推理型模型不会被截断）
    max_tokens: 8000,      // 仅在开启「限制 Tokens」时生效
    thinking_mode: 'suppress', // 默认关闭思考：实测推理型模型（含商用 flash）在「跟随模型」下会思考数分钟仍不输出正文，
                              // 关闭后同一张卷 40 秒级即可产出完整结果。存量供应商的配置不受此默认值影响。
    reasoning_limit: 15000,    // 仅「限制思考 / 关闭思考」生效：思考超此字数仍未作答即中止（0=不限制）
    system_prompt: ''
  }
  providerVisible.value = true
}
// 编辑供应商：apiKey 不回显明文，留空则保留原值
const openEditProvider = (p) => {
  editingProviderId.value = p.id
  providerForm.value = {
    id: p.id,
    name: p.name || '',
    provider: p.provider || 'custom',
    base_url: p.base_url || '',
    api_key: '',
    api_key_set: p.api_key_set,
    api_key_masked: p.api_key_masked,
    model: p.model || '',
    multimodal: p.multimodal !== false,
    temperature: p.temperature ?? 0.1,
    stream: p.stream !== false,               // 缺省视为开启
    limit_tokens: (p.max_tokens || 0) > 0,    // 有限制值才算「限制」
    max_tokens: (p.max_tokens || 0) > 0 ? p.max_tokens : 8000,
    thinking_mode: (p.thinking_mode === 'suppress' || p.thinking_mode === 'limited') ? p.thinking_mode : 'default',
    reasoning_limit: p.reasoning_limit !== undefined && p.reasoning_limit !== null ? Number(p.reasoning_limit) || 0 : 15000,
    system_prompt: p.system_prompt || ''
  }
  providerVisible.value = true
}
// 选择预设快捷回填 base_url / model
const onProviderPresetChange = (key) => {
  const p = presets.value.find(x => x.key === key)
  if (p) {
    providerForm.value.base_url = p.base_url
    providerForm.value.model = p.model
    providerForm.value.multimodal = p.multimodal
    if (!providerForm.value.name) providerForm.value.name = presetShortName(p.label)
  }
}
const restoreDefaultPrompt = () => {
  providerForm.value.system_prompt = defaultPrompt.value
}
// 把 UI 专用的 limit_tokens 开关翻译成后端语义：关闭限制 => max_tokens=0（不下发，模型自由生成）
const buildProviderPayload = () => {
  const f = providerForm.value
  return { ...f, max_tokens: f.limit_tokens ? (Number(f.max_tokens) || 0) : 0 }
}
// 保存供应商（新增 / 编辑）
const saveProvider = async () => {
  if (!providerForm.value.base_url || !providerForm.value.model) {
    return ElMessage.warning('请填写服务地址（base_url）与模型名（model）')
  }
  providerSaving.value = true
  try {
    const payload = buildProviderPayload()
    if (editingProviderId.value) {
      await updateAiProvider(editingProviderId.value, payload)
      ElMessage.success('供应商已更新')
    } else {
      await addAiProvider(payload)
      ElMessage.success('供应商已添加')
    }
    providerVisible.value = false
    await loadConfig()
  } catch (e) { /* 拦截器已提示 */ } finally {
    providerSaving.value = false
  }
}
// 测试编辑中（未保存）的配置
const testConn = async () => {
  if (!providerForm.value.base_url || !providerForm.value.model) {
    return ElMessage.warning('请先填写服务地址与模型名')
  }
  testing.value = true
  try {
    const payload = buildProviderPayload()
    if (editingProviderId.value) payload.provider_id = editingProviderId.value
    const r = await testAiConnection(payload)
    ElMessage.success('连接成功' + (r && r.reply ? `：${r.reply}` : ''))
  } catch (e) { /* 拦截器已提示 */ } finally {
    testing.value = false
  }
}
// 测试已保存供应商
const testSavedProvider = async (p) => {
  try {
    const r = await testAiProvider(p.id)
    ElMessage.success(`「${p.name}」连接成功` + (r && r.reply ? `：${r.reply}` : ''))
  } catch (e) { /* 拦截器已提示 */ }
}
// 删除供应商
const removeProvider = async (p) => {
  try {
    await deleteAiProvider(p.id)
    ElMessage.success('供应商已删除')
    await loadConfig()
  } catch (e) { /* 拦截器已提示 */ }
}

// ---------- 展示辅助 ----------
// 「已停止」单独成一档：老师主动取消不等于批改失败，配色与提示都要区分开，
// 否则批量批改时会把主动停止的卷子误读成「模型出错」。
const statusTag = (s) => ({
  pending: { type: 'info', label: '等待中' },
  processing: { type: 'warning', label: '批改中' },
  success: { type: 'success', label: '已完成' },
  failed: { type: 'danger', label: '失败' },
  cancelled: { type: 'info', label: '已停止' }
}[s] || { type: 'info', label: s })

// 是否仍在进行中（等待中 / 批改中）：决定是否展示进度与「停止」入口、是否继续轮询
const isRunning = (t) => !!t && (t.status === 'pending' || t.status === 'processing')

const resultTag = (r) => ({
  correct: { type: 'success', label: '✓ 正确' },
  wrong: { type: 'danger', label: '✗ 错误' },
  partial: { type: 'warning', label: '◐ 部分正确' },
  blank: { type: 'info', label: '— 未作答' },
  unknown: { type: 'info', label: '? 待判定' }
}[r] || { type: 'info', label: '? 待判定' })

// ---------- 置信度（AI 自评把握度）展示 ----------
// 仅有数值时才展示；阈值 80 / 60 与后端导出汇总口径保持一致。
const hasConfidence = (q) => !!q && typeof q.confidence === 'number'
const confidenceLevel = (c) => {
  const n = Number(c)
  if (!Number.isFinite(n)) return { key: 'unknown', label: '未知' }
  if (n >= 80) return { key: 'high', label: '高' }
  if (n >= 60) return { key: 'mid', label: '中' }
  return { key: 'low', label: '低' }
}
const confidenceTag = (c) => ({ high: 'success', mid: 'warning', low: 'danger' }[confidenceLevel(c).key] || 'info')
const confidenceTip = (c) => `AI 对本题判分的把握程度：${confidenceLevel(c).label}（${c}%）。这是模型自评，不代表判分一定准确；把握低的题建议重点核对。`

const scoreClass = (score, full) => {
  if (score === null || score === undefined) return ''
  const f = Number(full) || 100
  const ratio = Number(score) / f
  if (ratio >= 0.9) return 'score-good'
  if (ratio >= 0.8) return 'score-mid'
  if (ratio >= 0.6) return 'score-ok'
  return 'score-bad'
}

// ---------- 初始化 ----------
onMounted(async () => {
  try {
    const p = await getAiPresets()
    presets.value = p.presets || []
    defaultPrompt.value = p.default_system_prompt || ''
  } catch (e) { /* 拦截器已提示 */ }
  loadConfig()
  try { exams.value = await getExams() } catch (e) { /* ignore */ }
  try { students.value = await getStudents() } catch (e) { /* ignore */ }
  await loadTasks()
  if (tasks.value.some(t => t.status === 'pending' || t.status === 'processing')) startPolling()
})
onBeforeUnmount(() => {
  stopPolling()
  stopDetailPolling()
})
</script>

<style scoped>
.mb-16 { margin-bottom: 16px; }
.cfg-enabled { display: flex; align-items: center; margin-bottom: 16px; }
.cfg-enabled-label { font-size: 14px; font-weight: 600; color: #303133; margin-right: 12px; }
.cfg-upload { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; background: #fafafa; margin-bottom: 16px; }
.cfg-upload-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.cfg-providers-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.topbar { display: flex; justify-content: space-between; align-items: center; }
.topbar-left { display: flex; align-items: center; gap: 10px; }
.page-name { font-size: 16px; font-weight: 600; color: #303133; }
.model-info { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #909399; }
.card-title { font-weight: 600; }
.card-title-row { display: flex; justify-content: space-between; align-items: center; }
/* 批改记录筛选行：允许换行，窄屏（手机）自动堆叠不溢出 */
.filter-bar { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.start-form { margin-bottom: 4px; }
.answer-block { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; background: #fafafa; margin-top: 12px; }
.answer-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.batch-panel { border: 1px solid #ebeef5; border-radius: 6px; padding: 12px; background: #f7faf7; margin-top: 14px; }
.batch-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.batch-head-actions { display: flex; align-items: center; gap: 8px; }
.batch-stat { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.batch-select-list { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
.batch-select-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.batch-stu { margin: 4px 12px 4px 0; }
.batch-noimg { display: flex; flex-wrap: wrap; gap: 2px; }
.form-tip { font-size: 12px; color: #909399; margin-top: 6px; line-height: 1.6; }
.text-muted { color: #c0c4cc; }
.full { color: #909399; font-size: 12px; }

.score-good { color: #67c23a; font-weight: 600; }
.score-mid { color: #409eff; font-weight: 600; }
.score-ok { color: #e6a23c; font-weight: 600; }
.score-bad { color: #f56c6c; font-weight: 600; }

.detail-wrap { height: 74vh; display: flex; flex-direction: column; overflow: hidden; }
.detail-head { display: flex; flex-wrap: wrap; gap: 24px; padding-bottom: 12px; border-bottom: 1px solid #f0f0f0; margin-bottom: 12px; flex-shrink: 0; }
.detail-wrap > .el-alert { flex-shrink: 0; }
/* 进行中进度条 + 停止入口：按钮与提示同一行，老师不用先滚到弹窗底部再找按钮 */
.run-box { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; flex-shrink: 0; }
/* 实时输出尾窗：等宽小字 + 纵向滚动（最新在底部），保留换行便于肉眼识别重复输出 */
.tail-box { border: 1px solid #ebeef5; border-radius: 6px; background: #fafafa; overflow: hidden; margin-bottom: 12px; flex-shrink: 0; }
.tail-head { padding: 4px 10px; font-size: 12px; color: #909399; background: #f5f7fa; border-bottom: 1px solid #ebeef5; }
.tail-body { max-height: 132px; overflow-y: auto; padding: 8px 10px; font-family: Menlo, Consolas, 'Courier New', monospace; font-size: 12px; line-height: 1.6; color: #606266; white-space: pre-wrap; word-break: break-all; }
.run-box .el-alert { flex: 1; min-width: 0; }
.run-stop { flex-shrink: 0; }
.detail-head-item { display: flex; flex-direction: column; gap: 4px; }
.detail-head-item .label { font-size: 12px; color: #909399; }
.detail-head-item .value { font-size: 14px; color: #303133; }
.detail-head-item .value.big { font-size: 24px; }
.detail-body { display: flex; gap: 16px; flex: 1; min-height: 0; overflow: hidden; }
.detail-left { width: 300px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; }
.detail-right { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding-right: 6px; }
.section-title { font-size: 13px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.img-stage { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; background: #fafafa; border: 1px solid #ebeef5; border-radius: 6px; overflow: hidden; }
.stage-img { width: 100%; height: 100%; }
.img-thumbs { display: flex; gap: 6px; margin-top: 8px; overflow-x: auto; padding-bottom: 2px; flex-shrink: 0; }
.thumb { width: 52px; height: 52px; flex-shrink: 0; border: 2px solid transparent; border-radius: 4px; overflow: hidden; cursor: pointer; background: #f0f2f5; }
.thumb.active { border-color: #409eff; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.q-list { display: flex; flex-direction: column; gap: 8px; }
.conf-summary { border: 1px solid #ebeef5; border-left: 3px solid #e6a23c; border-radius: 6px; padding: 8px 12px; background: #fffbf5; margin-bottom: 10px; }
.conf-line { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; color: #606266; }
.conf-line b { color: #e6a23c; }
.conf-sub { font-size: 12px; color: #909399; }
.q-group { display: flex; flex-direction: column; gap: 8px; }
.q-group-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 10px; background: #f5f7fa; border: 1px solid #ebeef5; border-left: 3px solid #409eff; border-radius: 6px; }
.q-group-head-edit { border-left-color: #67c23a; }
.q-group-title { font-weight: 600; color: #303133; }
.q-group-count { font-size: 12px; color: #909399; }
.q-group-sum { margin-left: auto; font-size: 13px; color: #606266; }
.q-group-sum b { color: #409eff; font-weight: 600; }
.q-item { border: 1px solid #ebeef5; border-left: 3px solid #dcdfe6; border-radius: 6px; padding: 8px 12px; background: #fff; }
.q-item.q-correct { border-left-color: #67c23a; }
.q-item.q-wrong { border-left-color: #f56c6c; }
.q-item.q-partial { border-left-color: #e6a23c; }
.q-item.q-blank { border-left-color: #909399; }
.q-item.q-edit { border-left-color: #409eff; }
.q-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
.q-no { font-weight: 600; color: #303133; }
.q-score { margin-left: auto; font-weight: 600; color: #409eff; }
.q-row { font-size: 13px; color: #606266; line-height: 1.7; word-break: break-word; }
.q-label { display: inline-block; min-width: 34px; color: #909399; margin-right: 6px; }
.q-comment { color: #e6a23c; }
.adopt-ai { font-weight: 600; color: #409eff; margin-right: 12px; }

.edit-summary { border: 1px solid #ebeef5; border-radius: 6px; padding: 10px 12px; background: #fafafa; margin-bottom: 10px; }
.edit-sum-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.edit-sum-row + .edit-sum-row { margin-top: 8px; }
.edit-label { font-size: 13px; color: #606266; }
.edit-sum { color: #409eff; }
.edit-score { display: flex; align-items: center; gap: 4px; margin-left: auto; }

/* ===================== 移动端适配（≤768px）===================== */
/* 仅窄屏生效，桌面端样式零改动 */
@media (max-width: 768px) {
  /* 顶部状态栏与各类卡片头允许换行，避免「模型配置」等按钮被挤出屏幕 */
  .topbar { flex-wrap: wrap; gap: 8px; }
  .topbar-left { flex-wrap: wrap; gap: 6px; }
  .batch-head { flex-wrap: wrap; gap: 8px; }
  .answer-head { flex-wrap: wrap; gap: 8px; }
  .card-title-row { flex-wrap: wrap; gap: 8px; }

  /* 批改详情弹窗：图片列与题目列改为上下堆叠（窄屏放不下左右两栏） */
  .detail-body { flex-direction: column; gap: 8px; }
  /* 图片列不再固定 300px 宽，限制整体高度，剩余空间留给题目区滚动 */
  .detail-left { width: auto; flex: none; max-height: 40vh; }
}
</style>
