/**
 * AI客服数据看板 - 知识库文件页
 * 优先读取远端文件列表；代理不可用时退回本地演示数据
 */

import { initAuth } from './auth.js';
import {
  addKnowledgeBaseChunk,
  deleteKnowledgeBaseFile,
  getKnowledgeBaseChunkInfo,
  getKnowledgeBaseFileInfo,
  isKnowledgeBaseProxyEnabled,
  listKnowledgeBaseChunks,
  listKnowledgeBaseFiles,
  updateKnowledgeBaseChunk,
  uploadKnowledgeBaseFiles
} from './knowledge-base-provider.js';
import '../css/style.css';

const STORAGE_KEY = 'csb:knowledgeBaseFiles';
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'xlsx',
  'xls',
  'csv'
]);
const UPLOAD_POLL_INTERVAL = 2500;
const PROCESS_STATUS_LABELS = {
  0: '导入成功',
  1: '导入失败',
  2: '排队中',
  3: '更新中',
  6: '处理中'
};

const defaultRecords = [
  {
    doc_id: '_sys_auto_gen_doc_id-3649169154633492992',
    doc_name: '最终话术库_造型类修护类产品知识库.xlsx',
    doc_type: 'xlsx',
    doc_size: 10149,
    total_tokens: 12859,
    point_num: 28,
    update_time: 1770784406,
    collection_name: 'colorlomon_online',
    status: { process_status: 0 }
  },
  {
    doc_id: '_sys_auto_gen_doc_id-8485389539782594023',
    doc_name: '最终话术库_染色话术库.xlsx',
    doc_type: 'xlsx',
    doc_size: 15140,
    total_tokens: 47836,
    point_num: 47,
    update_time: 1770784408,
    collection_name: 'colorlomon_online',
    status: { process_status: 0 }
  },
  {
    doc_id: '_sys_auto_gen_doc_id-16467686832468054727',
    doc_name: '最终话术库_其他客服通用话术.xlsx',
    doc_type: 'xlsx',
    doc_size: 17728,
    total_tokens: 15067,
    point_num: 96,
    update_time: 1770784410,
    collection_name: 'colorlomon_online',
    status: { process_status: 0 }
  }
];

let records = [];
let pendingFiles = [];
let uploadTasks = [];
let currentFilter = 'all';
let isUploading = false;
let uploadPollTimer = null;
let chunkModalState = createChunkModalState();

const proxyEnabled = isKnowledgeBaseProxyEnabled();

document.addEventListener('DOMContentLoaded', async function () {
  initAuth();
  await initKnowledgeBase();
});

async function initKnowledgeBase() {
  bindEvents();
  records = await loadInitialRecords();
  renderAll();
  setModeFeedback();
}

function bindEvents() {
  const uploadTrigger = document.getElementById('kb-upload-trigger');
  const fileInput = document.getElementById('kb-file-input');
  const uploadSubmit = document.getElementById('kb-upload-submit');
  const uploadClear = document.getElementById('kb-upload-clear');
  const refreshBtn = document.getElementById('kb-refresh-btn');
  const filterTabs = document.getElementById('kb-filter-tabs');
  const tableBody = document.getElementById('kb-records-body');
  const chunkModal = document.getElementById('kb-chunk-modal');
  const chunkClose = document.getElementById('kb-chunk-close');
  const chunkList = document.getElementById('kb-chunk-list');
  const chunkAdd = document.getElementById('kb-chunk-add');
  const chunkRefresh = document.getElementById('kb-chunk-refresh');
  const chunkSave = document.getElementById('kb-chunk-save');
  const chunkCancel = document.getElementById('kb-chunk-cancel');
  const chunkType = document.getElementById('kb-chunk-type');
  const chunkContent = document.getElementById('kb-chunk-content');
  const chunkTitle = document.getElementById('kb-chunk-title');
  const chunkQuestion = document.getElementById('kb-chunk-question');
  const chunkFieldsList = document.getElementById('kb-chunk-fields-list');
  const chunkFieldAdd = document.getElementById('kb-chunk-field-add');

  if (uploadTrigger && fileInput) {
    uploadTrigger.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  if (uploadSubmit) {
    uploadSubmit.addEventListener('click', handleUploadSubmit);
  }

  if (uploadClear) {
    uploadClear.addEventListener('click', clearUploadQueue);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshRecordsFromSource);
  }

  if (filterTabs) {
    filterTabs.addEventListener('click', event => {
      const tab = event.target.closest('.filter-tab');
      if (!tab) return;
      currentFilter = tab.dataset.filter || 'all';
      filterTabs.querySelectorAll('.filter-tab').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');
      renderRecordsTable();
    });
  }

  if (tableBody) {
    tableBody.addEventListener('click', handleTableAction);
  }

  if (chunkModal) {
    chunkModal.addEventListener('click', event => {
      if (event.target === chunkModal) {
        closeChunkModal();
      }
    });
  }

  if (chunkClose) {
    chunkClose.addEventListener('click', closeChunkModal);
  }

  if (chunkCancel) {
    chunkCancel.addEventListener('click', closeChunkModal);
  }

  if (chunkList) {
    chunkList.addEventListener('click', event => {
      const row = event.target.closest('[data-point-id]');
      if (!row) return;
      chunkModalState.isCreating = false;
      handleChunkSelect(row.dataset.pointId || '');
    });
  }

  if (chunkAdd) {
    chunkAdd.addEventListener('click', startChunkCreate);
  }

  if (chunkRefresh) {
    chunkRefresh.addEventListener('click', refreshChunkList);
  }

  if (chunkSave) {
    chunkSave.addEventListener('click', handleChunkSave);
  }

  [chunkContent, chunkTitle, chunkQuestion].forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      if (!chunkModalState.selectedChunk && !chunkModalState.isCreating) return;
      chunkModalState.isDirty = true;
      if (input.tagName === 'TEXTAREA') {
        autoResizeTextarea(input);
      }
      renderChunkModalHeader();
    });
  });

  if (chunkFieldsList) {
    chunkFieldsList.addEventListener('input', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !chunkModalState.selectedChunk) return;
      chunkModalState.isDirty = true;
      if (target.tagName === 'TEXTAREA') {
        autoResizeTextarea(target);
      }
      renderChunkModalHeader();
    });

    chunkFieldsList.addEventListener('click', event => {
      const removeButton = event.target.closest('[data-field-remove]');
      if (!removeButton) return;
      removeButton.closest('.kb-chunk-field-row')?.remove();
      syncFieldTip();
      chunkModalState.isDirty = true;
      renderChunkModalHeader();
    });
  }

  if (chunkFieldAdd) {
    chunkFieldAdd.addEventListener('click', () => {
      appendChunkFieldRow({ field_name: '', field_value: '' });
      syncFieldTip();
      chunkModalState.isDirty = true;
      renderChunkModalHeader();
    });
  }

  if (chunkType) {
    chunkType.addEventListener('change', event => {
      chunkModalState.selectedChunkType = String(event.target.value || 'text');
      chunkModalState.isDirty = true;
      syncChunkTypeUI();
      renderChunkModalHeader();
    });
  }
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files || []);
  if (files.length === 0) return;

  const validFiles = [];
  const invalidNames = [];

  files.forEach(file => {
    const ext = inferDocType(file.name);
    if (ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
      validFiles.push(file);
    } else {
      invalidNames.push(file.name);
    }
  });

  if (validFiles.length === 0) {
    setFeedback('kb-upload-feedback', '仅支持 PDF / DOC / DOCX / TXT / MD / XLS / XLSX / CSV', 'error');
    event.target.value = '';
    return;
  }

  const existedKeys = new Set(pendingFiles.map(file => `${file.name}-${file.size}`));
  validFiles.forEach(file => {
    const key = `${file.name}-${file.size}`;
    if (!existedKeys.has(key)) {
      pendingFiles.push(file);
      existedKeys.add(key);
    }
  });

  renderUploadQueue();
  const successMessage = `已加入 ${validFiles.length} 个文件到上传队列`;
  if (invalidNames.length > 0) {
    setFeedback('kb-upload-feedback', `${successMessage}，已忽略 ${invalidNames.length} 个不支持的文件`, 'success');
  } else {
    setFeedback('kb-upload-feedback', successMessage, 'success');
  }
  event.target.value = '';
}

async function handleUploadSubmit() {
  if (pendingFiles.length === 0) {
    setFeedback('kb-upload-feedback', '请先选择需要上传的文档', 'error');
    return;
  }

  if (isUploading) {
    setFeedback('kb-upload-feedback', '当前上传请求尚未完成，请稍后再试', 'error');
    return;
  }

  if (proxyEnabled) {
    try {
      const filesToUpload = [...pendingFiles];
      isUploading = true;
      renderUploadQueue();
      setFeedback('kb-upload-feedback', `正在提交 ${filesToUpload.length} 个文件，已进入导入队列后会开始显示处理进度`, 'success');

      const result = await uploadKnowledgeBaseFiles(filesToUpload);
      const successCount = Number(result.successCount || filesToUpload.length);
      const createdTasks = result.items.map((item, index) => createRemoteUploadTask(item, filesToUpload[index]));

      uploadTasks = [...createdTasks, ...uploadTasks];
      pendingFiles = [];
      renderAll();
      setFeedback('kb-upload-feedback', `已提交 ${successCount} 个文件，正在查询导入进度。`, 'success');
      startUploadProgressPolling();
      return;
    } catch (error) {
      setFeedback('kb-upload-feedback', `上传失败：${error.message}`, 'error');
      return;
    } finally {
      isUploading = false;
      renderUploadQueue();
    }
  }

  const now = new Date();
  const mapped = pendingFiles.map(file => ({
    doc_id: `local-doc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    doc_name: file.name,
    doc_type: inferDocType(file.name),
    doc_size: file.size,
    total_tokens: estimateTokenUsage(file.size),
    point_num: estimatePointCount(file.size),
    update_time: Math.floor(now.getTime() / 1000),
    collection_name: 'default_files',
    status: { process_status: 0 },
    source: 'local'
  }));

  records = [...mapped, ...records];
  uploadTasks = [
    ...mapped.map(item => createLocalUploadTask(item)),
    ...uploadTasks
  ];
  pendingFiles = [];
  saveRecords(records);
  renderAll();
  setFeedback('kb-upload-feedback', `已加入并展示 ${mapped.length} 个本地演示文件`, 'success');
}

function clearUploadQueue() {
  if (hasActiveUploadTasks()) {
    setFeedback('kb-upload-feedback', '当前仍有文件在处理中，暂不支持清空进行中的任务', 'error');
    return;
  }

  pendingFiles = [];
  uploadTasks = [];
  renderUploadQueue();
  setFeedback('kb-upload-feedback', '上传队列已清空', 'success');
}

function handleTableAction(event) {
  const actionBtn = event.target.closest('[data-action]');
  if (!actionBtn) return;

  const action = actionBtn.dataset.action;
  const id = actionBtn.dataset.id;
  if (!id) return;

  if (action === 'chunks') {
    openChunkModal(id);
    return;
  }

  if (action !== 'delete') return;

  handleDeleteRecord(id);
}

function renderAll() {
  renderSummary();
  renderRecordsTable();
  renderUploadQueue();
}

function renderSummary() {
  const totalFiles = records.length;
  const excelFiles = records.filter(item => ['xlsx', 'xls', 'csv'].includes(normalizeDocType(item.doc_type))).length;
  const totalTokens = records.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0);

  setText('kb-total-count', totalFiles.toLocaleString());
  setText('kb-excel-count', excelFiles.toLocaleString());
  setText('kb-token-count', totalTokens.toLocaleString());
}

function renderUploadQueue() {
  const container = document.getElementById('kb-upload-list');
  if (!container) return;

  if (pendingFiles.length === 0 && uploadTasks.length === 0) {
    container.innerHTML = '<div class="kb-empty">当前无待上传文件</div>';
    syncUploadActionState();
    return;
  }

  const pendingMarkup = pendingFiles.map(file => `
    <div class="kb-upload-item">
      <div class="kb-upload-meta">
        <span class="kb-upload-name">${escapeHtml(file.name)}</span>
        <span class="kb-upload-size">${formatFileSize(file.size)}</span>
      </div>
      <span class="kb-upload-state pending">待上传</span>
    </div>
  `).join('');

  const taskMarkup = uploadTasks.map(task => `
    <div class="kb-upload-item task ${task.phase}">
      <div class="kb-upload-meta">
        <span class="kb-upload-name">${escapeHtml(task.docName)}</span>
        <span class="kb-upload-size">${formatFileSize(task.size)}</span>
      </div>
      <div class="kb-upload-progress">
        <div class="kb-upload-progress-head">
          <span class="kb-upload-state ${task.phase}">${escapeHtml(task.statusLabel)}</span>
          <span class="kb-upload-progress-value">${task.phase === 'success' ? '100%' : `${Math.min(task.progress, 99)}%`}</span>
        </div>
        <div class="kb-upload-progress-bar">
          <div class="kb-upload-progress-fill ${task.phase}" style="width: ${task.phase === 'success' ? 100 : Math.min(task.progress, 99)}%"></div>
        </div>
        <div class="kb-upload-progress-note">${escapeHtml(task.detail || defaultUploadTaskDetail(task))}</div>
      </div>
    </div>
  `).join('');

  container.innerHTML = `${pendingMarkup}${taskMarkup}`;
  syncUploadActionState();
}

function renderRecordsTable() {
  const tbody = document.getElementById('kb-records-body');
  if (!tbody) return;

  const filtered = filterRecords(records, currentFilter);
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#9CA3AF;">暂无文件记录</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td><div class="table-cell-main">${escapeHtml(repairDisplayFilename(item.doc_name))}</div></td>
      <td><div class="table-cell-sub">${String(item.doc_type || '--').toUpperCase()}</div></td>
      <td><div class="table-cell-sub">${formatFileSize(Number(item.doc_size || 0))}</div></td>
      <td><div class="table-cell-sub">${Number(item.total_tokens || 0).toLocaleString()}</div></td>
      <td><div class="table-cell-sub">${Number(item.point_num || 0).toLocaleString()}</div></td>
      <td><div class="table-cell-sub">${formatUnixTime(item.update_time)}</div></td>
      <td>${renderActionCell(item)}</td>
    </tr>
  `).join('');
}

function renderActionCell(item) {
  if (proxyEnabled) {
    return `
      <div class="kb-action-group">
        <button class="link-text kb-chunk-btn" data-action="chunks" data-id="${item.doc_id}">切片详情</button>
        <button class="link-text kb-delete-btn" data-action="delete" data-id="${item.doc_id}">删除</button>
      </div>
    `;
  }

  return `
    <div class="kb-action-group">
      <button class="link-text kb-delete-btn" data-action="delete" data-id="${item.doc_id}">移除</button>
    </div>
  `;
}

function filterRecords(items, filter) {
  if (filter === 'excel') {
    return items.filter(item => ['xlsx', 'xls', 'csv'].includes(normalizeDocType(item.doc_type)));
  }

  if (filter === 'other') {
    return items.filter(item => !['xlsx', 'xls', 'csv'].includes(normalizeDocType(item.doc_type)));
  }

  return items;
}

async function refreshRecordsFromSource() {
  try {
    records = await loadInitialRecords();
    renderAll();
    setModeFeedback();
  } catch (error) {
    window.alert(`刷新失败：${error.message}`);
  }
}

async function handleDeleteRecord(docId) {
  const target = records.find(item => item.doc_id === docId);
  if (!target) {
    return;
  }

  const confirmed = window.confirm(`确认删除文件“${repairDisplayFilename(target.doc_name)}”吗？`);
  if (!confirmed) {
    return;
  }

  if (proxyEnabled) {
    try {
      await deleteKnowledgeBaseFile({ doc_id: docId });
      records = records.filter(item => item.doc_id !== docId);
      uploadTasks = uploadTasks.filter(task => task.docId !== docId);
      renderAll();
      setFeedback('kb-upload-feedback', `已删除文件：${repairDisplayFilename(target.doc_name)}`, 'success');
    } catch (error) {
      setFeedback('kb-upload-feedback', `删除失败：${error.message}`, 'error');
    }
    return;
  }

  records = records.filter(item => item.doc_id !== docId);
  saveRecords(records);
  renderAll();
  setFeedback('kb-upload-feedback', `已移除本地文件：${repairDisplayFilename(target.doc_name)}`, 'success');
}

async function openChunkModal(docId) {
  const record = records.find(item => item.doc_id === docId);
  if (!record) {
    return;
  }

  if (!proxyEnabled) {
    setFeedback('kb-upload-feedback', '本地演示模式暂不支持查看切片', 'error');
    return;
  }

  chunkModalState = {
    ...createChunkModalState(),
    open: true,
    docId,
    docName: repairDisplayFilename(record.doc_name),
    loading: true
  };
  renderChunkModal();

  try {
    const result = await listKnowledgeBaseChunks({ doc_id: docId, limit: 100 });
    chunkModalState.loading = false;
    chunkModalState.chunks = result.records;
    chunkModalState.totalNum = result.totalNum;
    if (result.records.length > 0) {
      chunkModalState.selectedPointId = String(result.records[0].point_id || '');
      renderChunkModal();
      await loadSelectedChunkDetail(chunkModalState.selectedPointId);
      return;
    }

    renderChunkModal();
  } catch (error) {
    chunkModalState.loading = false;
    chunkModalState.error = error.message || '切片加载失败';
    renderChunkModal();
  }
}

function closeChunkModal() {
  chunkModalState = createChunkModalState();
  renderChunkModal();
}

async function handleChunkSelect(pointId) {
  if (!pointId || chunkModalState.selectedPointId === pointId && chunkModalState.selectedChunk) {
    return;
  }

  chunkModalState.selectedPointId = pointId;
  chunkModalState.selectedChunk = null;
  chunkModalState.detailLoading = true;
  chunkModalState.error = '';
  renderChunkModal();
  await loadSelectedChunkDetail(pointId);
}

async function loadSelectedChunkDetail(pointId) {
  try {
    const result = await getKnowledgeBaseChunkInfo({ point_id: pointId });
    chunkModalState.selectedChunk = result.record;
    chunkModalState.detailLoading = false;
    chunkModalState.isDirty = false;
    chunkModalState.error = '';
    populateChunkForm(result.record);
    renderChunkModal();
  } catch (error) {
    chunkModalState.detailLoading = false;
    chunkModalState.error = error.message || '切片详情加载失败';
    renderChunkModal();
  }
}

async function refreshChunkList(preferredPointId = '') {
  if (!chunkModalState.docId) {
    return;
  }

  chunkModalState.loading = true;
  chunkModalState.error = '';
  renderChunkModal();

  try {
    const result = await listKnowledgeBaseChunks({ doc_id: chunkModalState.docId, limit: 100 });
    chunkModalState.loading = false;
    chunkModalState.chunks = result.records;
    chunkModalState.totalNum = result.totalNum;
    if (preferredPointId) {
      chunkModalState.selectedPointId = preferredPointId;
    } else if (chunkModalState.selectedPointId) {
      const exists = result.records.some(item => String(item.point_id || '') === chunkModalState.selectedPointId);
      if (!exists) {
        chunkModalState.selectedPointId = result.records[0] ? String(result.records[0].point_id || '') : '';
      }
    } else {
      chunkModalState.selectedPointId = result.records[0] ? String(result.records[0].point_id || '') : '';
    }

    renderChunkModal();
    if (chunkModalState.selectedPointId) {
      await loadSelectedChunkDetail(chunkModalState.selectedPointId);
    }
  } catch (error) {
    chunkModalState.loading = false;
    chunkModalState.error = error.message || '切片刷新失败';
    renderChunkModal();
  }
}

async function handleChunkSave() {
  if (!chunkModalState.isCreating && (!chunkModalState.selectedPointId || !chunkModalState.selectedChunk)) {
    return;
  }

  const contentInput = document.getElementById('kb-chunk-content');
  const titleInput = document.getElementById('kb-chunk-title');
  const questionInput = document.getElementById('kb-chunk-question');
  const typeInput = document.getElementById('kb-chunk-type');
  const fields = collectChunkFields();
  const chunkType = String(typeInput?.value || chunkModalState.selectedChunkType || inferDefaultChunkType());

  chunkModalState.saving = true;
  chunkModalState.error = '';
  renderChunkModal();

  try {
    if (chunkModalState.isCreating) {
      const result = await addKnowledgeBaseChunk(buildChunkPayload({
        mode: 'create',
        docId: chunkModalState.docId,
        chunkType,
        title: titleInput?.value || '',
        question: questionInput?.value || '',
        content: contentInput?.value || '',
        fields
      }));
      const createdPointId = String(result?.data?.data?.point_id || '');
      chunkModalState.isCreating = false;
      setFeedback('kb-upload-feedback', '新切片已创建', 'success');
      await refreshChunkList(createdPointId);
      if (createdPointId) {
        await loadSelectedChunkDetail(createdPointId);
      }
    } else {
      await updateKnowledgeBaseChunk({
        point_id: chunkModalState.selectedPointId,
        chunk_title: titleInput?.value || '',
        question: questionInput?.value || '',
        content: contentInput?.value || '',
        ...(fields.length > 0 ? { fields } : {})
      });

      setFeedback('kb-upload-feedback', '切片内容已提交更新', 'success');
      await loadSelectedChunkDetail(chunkModalState.selectedPointId);
      await refreshChunkList(chunkModalState.selectedPointId);
    }
  } catch (error) {
    chunkModalState.saving = false;
    chunkModalState.error = error.message || (chunkModalState.isCreating ? '切片新增失败' : '切片更新失败');
    renderChunkModal();
  }
}

function renderChunkModal() {
  const modal = document.getElementById('kb-chunk-modal');
  if (!modal) return;

  modal.classList.toggle('show', chunkModalState.open);
  if (!chunkModalState.open) {
    return;
  }

  renderChunkModalHeader();
  renderChunkList();
  renderChunkDetail();
}

function renderChunkModalHeader() {
  setText('kb-chunk-modal-title', chunkModalState.docName || '切片详情');
  setText(
    'kb-chunk-modal-subtitle',
    chunkModalState.totalNum
      ? `当前文档共有 ${chunkModalState.totalNum} 个切片，可查看详情并直接修改内容`
      : '可查看当前文档的切片内容，并直接修改后提交'
  );

  const saveButton = document.getElementById('kb-chunk-save');
  if (saveButton) {
    saveButton.disabled = chunkModalState.saving || (!chunkModalState.isCreating && !chunkModalState.selectedPointId);
    saveButton.textContent = chunkModalState.saving ? '保存中...' : (chunkModalState.isCreating ? '新增切片' : '保存修改');
  }
}

function renderChunkList() {
  const container = document.getElementById('kb-chunk-list');
  if (!container) return;

  if (chunkModalState.loading) {
    container.innerHTML = '<div class="kb-chunk-empty">切片列表加载中...</div>';
    return;
  }

  if (chunkModalState.chunks.length === 0) {
    container.innerHTML = '<div class="kb-chunk-empty">当前文档暂无切片，可点击“新增切片”创建第一条</div>';
    return;
  }

  container.innerHTML = chunkModalState.chunks.map((chunk, index) => {
    const pointId = String(chunk.point_id || '');
    const isActive = pointId === chunkModalState.selectedPointId;
    return `
      <button type="button" class="kb-chunk-item ${isActive ? 'active' : ''}" data-point-id="${escapeHtml(pointId)}">
        <div class="kb-chunk-item-title">${escapeHtml(getChunkDisplayTitle(chunk, index))}</div>
        <div class="kb-chunk-item-meta">${escapeHtml(getChunkMeta(chunk))}</div>
        <div class="kb-chunk-item-preview">${escapeHtml(getChunkPreview(chunk))}</div>
      </button>
    `;
  }).join('');
}

function renderChunkDetail() {
  const detail = chunkModalState.selectedChunk;
  const errorEl = document.getElementById('kb-chunk-error');
  const detailPanel = document.getElementById('kb-chunk-detail-panel');

  if (errorEl) {
    errorEl.textContent = chunkModalState.error || '';
  }

  if (!detailPanel) return;

  if (chunkModalState.detailLoading) {
    detailPanel.classList.add('loading');
    return;
  }

  detailPanel.classList.remove('loading');

  if (chunkModalState.isCreating) {
    populateChunkForm(null);
    syncChunkTypeUI();
    return;
  }

  if (!detail) {
    populateChunkForm(null);
    return;
  }

  populateChunkForm(detail);
}

function populateChunkForm(detail) {
  const typeInput = document.getElementById('kb-chunk-type');
  const titleInput = document.getElementById('kb-chunk-title');
  const questionInput = document.getElementById('kb-chunk-question');
  const contentInput = document.getElementById('kb-chunk-content');
  const fieldsList = document.getElementById('kb-chunk-fields-list');
  const metaEl = document.getElementById('kb-chunk-meta');

  if (!detail) {
    if (typeInput) typeInput.value = chunkModalState.selectedChunkType || inferDefaultChunkType();
    if (titleInput) titleInput.value = '';
    if (questionInput) questionInput.value = '';
    if (contentInput) contentInput.value = '';
    if (fieldsList) fieldsList.innerHTML = '';
    if (metaEl) {
      metaEl.textContent = chunkModalState.isCreating
        ? `新增模式  |  类型：${typeInput?.value || chunkModalState.selectedChunkType || 'text'}`
        : '';
    }
    syncChunkTypeUI();
    syncFieldTip();
    return;
  }

  if (typeInput) typeInput.value = String(detail.chunk_type || inferDefaultChunkType());
  if (titleInput) titleInput.value = String(detail.chunk_title || '');
  if (questionInput) questionInput.value = normalizeChunkQuestion(detail);
  if (contentInput) {
    contentInput.value = String(detail.content || '');
    autoResizeTextarea(contentInput);
  }

  if (fieldsList) {
    fieldsList.innerHTML = '';
    normalizeChunkFields(detail.fields ?? detail.table_chunk_fields).forEach(field => {
      appendChunkFieldRow(field);
    });
    syncFieldTip();
  }

  if (metaEl) {
    metaEl.textContent = [
      detail.sheet_name ? `Sheet：${detail.sheet_name}` : '',
      detail.chunk_type ? `类型：${detail.chunk_type}` : '',
      detail.chunk_status ? `状态：${detail.chunk_status}` : ''
    ].filter(Boolean).join('  |  ');
  }
  syncChunkTypeUI();
}

function createChunkModalState() {
  return {
    open: false,
    docId: '',
    docName: '',
    totalNum: 0,
    chunks: [],
    loading: false,
    detailLoading: false,
    selectedPointId: '',
    selectedChunk: null,
    selectedChunkType: 'text',
    isCreating: false,
    saving: false,
    isDirty: false,
    error: ''
  };
}

function startChunkCreate() {
  chunkModalState.isCreating = true;
  chunkModalState.selectedPointId = '';
  chunkModalState.selectedChunk = null;
  chunkModalState.detailLoading = false;
  chunkModalState.error = '';
  chunkModalState.selectedChunkType = inferDefaultChunkType();
  renderChunkModal();
}

function inferDefaultChunkType() {
  const value = String(chunkModalState.selectedChunk?.chunk_type || chunkModalState.chunks[0]?.chunk_type || '').trim();
  if (value === 'structured' || value === 'faq' || value === 'text') {
    return value;
  }
  const docType = String(records.find(item => item.doc_id === chunkModalState.docId)?.doc_type || '').toLowerCase();
  if (docType === 'xlsx' || docType === 'xls' || docType === 'csv') {
    return 'structured';
  }
  return 'text';
}

function syncChunkTypeUI() {
  const typeInput = document.getElementById('kb-chunk-type');
  const titleInput = document.getElementById('kb-chunk-title');
  const questionInput = document.getElementById('kb-chunk-question');
  const contentInput = document.getElementById('kb-chunk-content');
  const fieldsSection = document.getElementById('kb-chunk-fields-section');
  const currentType = String(typeInput?.value || chunkModalState.selectedChunkType || inferDefaultChunkType());

  if (typeInput) {
    typeInput.disabled = !chunkModalState.isCreating;
  }

  if (questionInput) {
    questionInput.disabled = currentType !== 'faq';
    questionInput.placeholder = currentType === 'faq' ? 'FAQ 切片需要填写问题问法' : '仅 FAQ 切片需要填写问题问法';
  }

  if (contentInput) {
    contentInput.placeholder = currentType === 'structured'
      ? '结构化切片主要由下方字段生成，可按需补充说明'
      : '请输入切片内容';
  }

  if (fieldsSection) {
    fieldsSection.style.display = currentType === 'structured' ? '' : 'none';
  }

  if (titleInput) {
    titleInput.placeholder = currentType === 'text'
      ? '文本切片可按需补充标题'
      : '如接口返回为空，可按需补充标题';
  }
}

function buildChunkPayload({ mode, docId, chunkType, title, question, content, fields }) {
  const payload = {
    chunk_type: chunkType
  };

  if (mode === 'create') {
    if (!docId) {
      throw new Error('doc_id 不能为空');
    }
    payload.doc_id = docId;
  }

  if (title.trim()) {
    payload.chunk_title = title.trim();
  }

  if (chunkType === 'structured') {
    if (!fields.length) {
      throw new Error('结构化切片至少需要填写 1 个字段');
    }
    payload.fields = fields;
    return payload;
  }

  if (chunkType === 'faq') {
    if (!question.trim()) {
      throw new Error('FAQ 切片需要填写问题问法');
    }
    if (!content.trim()) {
      throw new Error('FAQ 切片需要填写切片内容');
    }
    payload.question = question.trim();
    payload.content = content.trim();
    return payload;
  }

  if (!content.trim()) {
    throw new Error('文本切片需要填写切片内容');
  }
  payload.content = content.trim();
  return payload;
}

async function loadInitialRecords() {
  if (proxyEnabled) {
    const result = await listKnowledgeBaseFiles({ limit: 100, return_token_usage: true });
    return result.records;
  }

  return loadLocalRecords();
}

function loadLocalRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...defaultRecords];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...defaultRecords];
    return parsed;
  } catch {
    return [...defaultRecords];
  }
}

function saveRecords(nextRecords) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextRecords));
  } catch {
    // ignore
  }
}

function setModeFeedback() {
  if (hasActiveUploadTasks()) {
    return;
  }

  setFeedback(
    'kb-upload-feedback',
    proxyEnabled
      ? '当前页面已接入在线文件列表与上传导入。'
      : '当前为本地演示模式，上传结果仅保存在浏览器本地。',
    proxyEnabled ? 'success' : 'success'
  );
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function setFeedback(id, message, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message || '';
  el.classList.remove('success', 'error');
  if (type === 'success' || type === 'error') {
    el.classList.add(type);
  }
}

function formatFileSize(size) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUnixTime(timestamp) {
  if (!timestamp) return '--';
  return formatDateTime(new Date(Number(timestamp) * 1000));
}

function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function normalizeDocType(type) {
  return String(type || '').trim().toLowerCase();
}

function inferDocType(filename) {
  const suffix = String(filename || '').split('.').pop();
  return normalizeDocType(suffix) || 'unknown';
}

function createRemoteUploadTask(item, file) {
  return {
    id: `remote-${item.doc_id}`,
    docId: String(item.doc_id || ''),
    docName: repairDisplayFilename(item.doc_name || file?.name || '未命名文件'),
    size: Number(file?.size || 0),
    progress: 8,
    phase: 'processing',
    statusCode: 2,
    statusLabel: '已提交',
    detail: '文件已提交到知识库，正在等待系统处理'
  };
}

function createLocalUploadTask(item) {
  return {
    id: `local-${item.doc_id}`,
    docId: String(item.doc_id || ''),
    docName: repairDisplayFilename(item.doc_name || '未命名文件'),
    size: Number(item.doc_size || 0),
    progress: 100,
    phase: 'success',
    statusCode: 0,
    statusLabel: '本地已加入',
    detail: '当前是本地演示模式，文件已直接加入列表'
  };
}

function syncUploadActionState() {
  const uploadSubmit = document.getElementById('kb-upload-submit');
  const uploadClear = document.getElementById('kb-upload-clear');
  if (uploadSubmit) {
    uploadSubmit.disabled = isUploading || pendingFiles.length === 0;
  }
  if (uploadClear) {
    uploadClear.disabled = isUploading;
  }
}

function startUploadProgressPolling() {
  if (!proxyEnabled || uploadPollTimer) {
    return;
  }

  scheduleUploadProgressPoll(300);
}

function scheduleUploadProgressPoll(delay = UPLOAD_POLL_INTERVAL) {
  uploadPollTimer = window.setTimeout(async () => {
    uploadPollTimer = null;
    await pollUploadProgress();
  }, delay);
}

async function pollUploadProgress() {
  const activeTasks = uploadTasks.filter(task => task.phase === 'processing');
  if (activeTasks.length === 0) {
    return;
  }

  const updates = await Promise.all(activeTasks.map(task => queryUploadTaskProgress(task)));
  const updateMap = new Map(updates.map(task => [task.docId, task]));
  uploadTasks = uploadTasks.map(task => updateMap.get(task.docId) || task);
  renderUploadQueue();

  const stillActive = uploadTasks.some(task => task.phase === 'processing');
  if (stillActive) {
    scheduleUploadProgressPoll();
    return;
  }

  records = await loadInitialRecords();
  renderAll();

  const successCount = uploadTasks.filter(task => task.phase === 'success').length;
  const failedCount = uploadTasks.filter(task => task.phase === 'error').length;
  if (failedCount > 0) {
    setFeedback('kb-upload-feedback', `导入完成：成功 ${successCount} 个，失败 ${failedCount} 个`, 'error');
  } else {
    setFeedback('kb-upload-feedback', `导入完成：共 ${successCount} 个文件已成功入库`, 'success');
  }
}

async function queryUploadTaskProgress(task) {
  try {
    const result = await getKnowledgeBaseFileInfo({
      doc_id: task.docId,
      return_token_usage: true
    });
    return applyUploadProgressRecord(task, result.record);
  } catch (error) {
    const message = String(error.message || '');
    if (/not exist|not found|不存在/i.test(message)) {
      return {
        ...task,
        progress: Math.max(task.progress, 10),
        statusLabel: '等待建档',
        detail: '知识库正在登记文件，稍后会继续更新进度'
      };
    }

    return {
      ...task,
      phase: 'processing',
      progress: Math.max(task.progress, 12),
      statusLabel: '重试中',
      detail: message || '进度查询失败，系统会自动继续重试'
    };
  }
}

function applyUploadProgressRecord(task, record) {
  const processStatus = Number(record?.status?.process_status);
  const statusLabel = PROCESS_STATUS_LABELS[processStatus] || '处理中';
  const progress = inferProgressByProcessStatus(processStatus, task.progress);
  const detail = normalizeStatusDetail(record, processStatus);
  const nextName = repairDisplayFilename(record?.doc_name || task.docName);

  if (processStatus === 0) {
    return {
      ...task,
      docName: nextName,
      progress: 100,
      phase: 'success',
      statusCode: 0,
      statusLabel,
      detail
    };
  }

  if (processStatus === 1) {
    return {
      ...task,
      docName: nextName,
      progress,
      phase: 'error',
      statusCode: 1,
      statusLabel,
      detail
    };
  }

  return {
    ...task,
    docName: nextName,
    progress,
    phase: 'processing',
    statusCode: processStatus,
    statusLabel,
    detail
  };
}

function inferProgressByProcessStatus(processStatus, previousProgress = 0) {
  const statusProgress = {
    0: 100,
    1: 88,
    2: 18,
    3: 88,
    6: 66
  };
  const nextProgress = statusProgress[processStatus] ?? 36;
  return Math.max(previousProgress, nextProgress);
}

function normalizeStatusDetail(record, processStatus) {
  const message = String(
    record?.status?.status_msg
      || record?.status?.message
      || record?.status?.msg
      || ''
  ).trim();
  if (message) {
    return message;
  }

  if (processStatus === 0) {
    return '火山知识库已完成解析，当前文件可正常使用';
  }

  if (processStatus === 1) {
    return '知识库处理失败，请检查文件内容或稍后重新上传';
  }

  if (processStatus === 2) {
    return '文件已进入处理队列，正在等待系统调度';
  }

  if (processStatus === 3) {
    return '知识库正在更新文档内容，请稍候';
  }

  if (processStatus === 6) {
    return '知识库正在解析并切分文档内容';
  }

  return '知识库正在处理中';
}

function defaultUploadTaskDetail(task) {
  if (task.phase === 'success') {
    return '火山知识库已完成解析，文件已可用';
  }

  if (task.phase === 'error') {
    return '当前文件处理失败，请稍后重新上传';
  }

  return '文件正在提交到知识库并等待处理';
}

function getChunkDisplayTitle(chunk, index) {
  const explicitTitle = String(chunk.chunk_title || '').trim();
  if (explicitTitle) {
    return explicitTitle;
  }

  const question = normalizeChunkQuestion(chunk);
  if (question) {
    return question;
  }

  if (chunk.sheet_name) {
    return `${chunk.sheet_name} · 切片 ${index + 1}`;
  }

  return `切片 ${index + 1}`;
}

function getChunkMeta(chunk) {
  return [
    chunk.sheet_name ? `Sheet：${chunk.sheet_name}` : '',
    chunk.chunk_type ? `类型：${chunk.chunk_type}` : '',
    chunk.chunk_status ? `状态：${chunk.chunk_status}` : ''
  ].filter(Boolean).join('  |  ');
}

function getChunkPreview(chunk) {
  return String(chunk.content || '').replace(/\s+/g, ' ').trim() || '暂无切片内容';
}

function normalizeChunkQuestion(chunk) {
  const question = chunk?.question;
  if (Array.isArray(question)) {
    return question.filter(Boolean).join(' / ');
  }
  return String(question || '').trim();
}

function formatChunkFields(fields) {
  if (fields === undefined || fields === null || fields === '') {
    return '';
  }

  try {
    return JSON.stringify(fields, null, 2);
  } catch {
    return String(fields);
  }
}

function normalizeChunkFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.map(field => ({
    field_name: String(field?.field_name || ''),
    field_value: String(field?.field_value || '')
  }));
}

function appendChunkFieldRow(field = { field_name: '', field_value: '' }) {
  const fieldsList = document.getElementById('kb-chunk-fields-list');
  if (!fieldsList) return;

  const row = document.createElement('div');
  row.className = 'kb-chunk-field-row';
  row.innerHTML = `
    <input class="form-input kb-chunk-field-name" data-field-name placeholder="字段名" value="${escapeHtml(field.field_name)}">
    <textarea class="form-textarea kb-chunk-field-value" data-field-value placeholder="字段值">${escapeHtml(field.field_value)}</textarea>
    <button type="button" class="btn-outline kb-chunk-field-remove" data-field-remove>删除</button>
  `;
  fieldsList.appendChild(row);

  const valueTextarea = row.querySelector('[data-field-value]');
  if (valueTextarea) {
    autoResizeTextarea(valueTextarea);
  }
}

function collectChunkFields() {
  const fieldsList = document.getElementById('kb-chunk-fields-list');
  if (!fieldsList) return [];

  return Array.from(fieldsList.querySelectorAll('.kb-chunk-field-row'))
    .map(row => ({
      field_name: String(row.querySelector('[data-field-name]')?.value || '').trim(),
      field_value: String(row.querySelector('[data-field-value]')?.value || '').trim()
    }))
    .filter(field => field.field_name || field.field_value);
}

function syncFieldTip() {
  const tip = document.getElementById('kb-chunk-fields-tip');
  const section = document.getElementById('kb-chunk-fields-section');
  const fields = collectChunkFields();
  if (tip) {
    tip.style.display = fields.length === 0 ? 'block' : 'none';
  }
  if (section) {
    section.classList.toggle('is-empty', fields.length === 0);
  }
}

function autoResizeTextarea(element) {
  if (!element) return;
  const minHeight = element.classList.contains('kb-chunk-field-value') ? 88 : 120;
  element.style.height = 'auto';
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`;
}

function repairDisplayFilename(filename) {
  const value = String(filename || '');
  if (!value) return value;

  if (!looksSuspiciousFilename(value)) {
    return value;
  }

  try {
    const repaired = decodeLatin1Utf8(value);
    if (repaired && repaired !== value && looksReadableFilename(repaired) && !looksMojibake(repaired)) {
      return repaired;
    }
  } catch {
    // ignore
  }

  return value;
}

function decodeLatin1Utf8(value) {
  const bytes = Uint8Array.from(Array.from(value).map(char => char.charCodeAt(0) & 0xff));
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function looksMojibake(value) {
  return /[ÃÂÅÆÐÑØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö]/.test(value);
}

function looksSuspiciousFilename(value) {
  return /�/.test(value) || looksMojibake(value);
}

function looksReadableFilename(value) {
  return /[\u4e00-\u9fff]/.test(value) || /^[\w.\- ()]+$/.test(value);
}

function hasActiveUploadTasks() {
  return uploadTasks.some(task => task.phase === 'processing');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function estimateTokenUsage(size) {
  return Math.max(1000, Math.round(size * 1.2));
}

function estimatePointCount(size) {
  return Math.max(8, Math.round(size / 512));
}
