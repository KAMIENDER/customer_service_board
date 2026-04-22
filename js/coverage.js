/**
 * AI客服数据看板 - 回复内容页面逻辑
 * 按“综合问题数 / 通用问法 / 商品问法 / 未回复问题明细”展示
 */

import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import {
  getCustomerServiceCategoryDetailFromDb,
  runCustomerServiceCoverageBacktest,
  getCustomerServiceCoverageBreakdownFromDb,
  getCustomerServiceCoverageSummaryFromDb,
  getCustomerServiceConversationDetailFromDb,
  getTransferQuestionsFromDb,
  loadFilterParams,
  saveFilterParams
} from './api.js';
import {
  addKnowledgeBaseChunk,
  deleteCoverageSceneBinding,
  getKnowledgeBaseFileInfo,
  getKnowledgeBaseChunkInfo,
  isKnowledgeBaseProxyEnabled,
  listCoverageSceneBindings,
  listKnowledgeBaseChunks,
  listKnowledgeBaseFiles,
  saveCoverageSceneBinding,
  updateKnowledgeBaseChunk,
  uploadKnowledgeBaseFiles
} from './knowledge-base-provider.js';
import '../css/style.css';

let currentFilterParams = { interval: 7 };
const savedFilterParams = loadFilterParams();
if (savedFilterParams) {
  currentFilterParams = savedFilterParams;
}

const DETAIL_KB_STATUS_LABELS = {
  0: '导入成功',
  1: '导入失败',
  2: '排队中',
  3: '更新中',
  6: '处理中'
};
const detailKnowledgeBaseEnabled = isKnowledgeBaseProxyEnabled();

let coverageBoardState = {
  totalQuestions: MockData.coverageStats.totalQuestions.value,
  answeredQuestions: MockData.coverageStats.answeredQuestions.value
};

let coverageCategoryState = buildUnansweredCoverageData(
  MockData.coverageStats.totalQuestions.value,
  MockData.coverageStats.answeredQuestions.value
);

const coverageCategoryExpandState = {
  general: new Set(),
  product: new Set()
};

let unansweredDetailModalState = {
  detailKey: '',
  level1Code: '',
  parentCode: '',
  subCode: '',
  problemType: '',
  parentLabel: '',
  subLabel: '',
  unansweredCount: 0,
  detailItems: [],
  files: [],
  loadingFiles: false,
  linkedDocs: [],
  activeDocId: '',
  pickerSelectedDocIds: [],
  lastTestResult: null
};

let detailChunkModalState = createDetailChunkModalState();

let questionsPageState = {
  currentPage: 1,
  pageSize: 20,
  totalCount: 0
};

document.addEventListener('DOMContentLoaded', function () {
  initAuth();
  initCoverageStats();
  initCoverageCategoryToggle();
  initQuestionsTable();
  initUnansweredDetailModal();
  initDetailChunkModal();
  initChatModal();
  initDateFilter();
});

async function initCoverageStats(params = currentFilterParams) {
  showCoverageLoadingState();

  try {
    const [summaryResponse, breakdownResponse] = await Promise.all([
      getCustomerServiceCoverageSummaryFromDb(params),
      getCustomerServiceCoverageBreakdownFromDb(params)
    ]);

    if (summaryResponse && summaryResponse.code === 0 && summaryResponse.data) {
      const data = summaryResponse.data;
      const totalQuestions = Number(data.total_question_num || 0);
      const answeredQuestions = Number(data.answered_question_num || 0);

      if (totalQuestions !== undefined) {
        coverageBoardState.totalQuestions = totalQuestions;
        animateValue('stat-total-questions', 0, totalQuestions, 1200);
      } else {
        setTextOrPlaceholder('stat-total-questions', '--');
      }

      if (answeredQuestions !== undefined) {
        coverageBoardState.answeredQuestions = answeredQuestions;
        animateValue('stat-answered', 0, answeredQuestions, 1200);
      } else {
        setTextOrPlaceholder('stat-answered', '--');
      }

      if (totalQuestions && answeredQuestions !== undefined) {
        setTextOrPlaceholder('stat-coverage-rate', formatPercent((answeredQuestions / totalQuestions) * 100));
      } else {
        setTextOrPlaceholder('stat-coverage-rate', '--');
      }
    }

    if (breakdownResponse && breakdownResponse.code === 0 && breakdownResponse.data) {
      coverageCategoryState = {
        generalRows: Array.isArray(breakdownResponse.data.general_rows) ? breakdownResponse.data.general_rows : [],
        productRows: Array.isArray(breakdownResponse.data.product_rows) ? breakdownResponse.data.product_rows : []
      };
    } else {
      coverageCategoryState = buildUnansweredCoverageData(
        coverageBoardState.totalQuestions,
        coverageBoardState.answeredQuestions
      );
    }
  } catch (error) {
    console.warn('获取覆盖率统计失败:', error?.message || error);
    showCoverageErrorState();
    coverageCategoryState = buildUnansweredCoverageData(
      coverageBoardState.totalQuestions,
      coverageBoardState.answeredQuestions
    );
  }

  renderUnansweredCoverageBoard();
  hideCoverageLoadingState();
}

function showCoverageLoadingState() {
  const ids = ['stat-total-questions', 'stat-answered', 'stat-coverage-rate'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<span class="loading-spinner"></span>';
    el.classList.add('loading');
  });

  setTableLoading('general-questions-body', 7);
  setTableLoading('product-questions-body', 7);
}

function hideCoverageLoadingState() {
  const ids = ['stat-total-questions', 'stat-answered', 'stat-coverage-rate'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('loading');
  });
}

function showCoverageErrorState() {
  setTextOrPlaceholder('stat-total-questions', MockData.coverageStats.totalQuestions.value.toLocaleString('zh-CN'));
  setTextOrPlaceholder('stat-answered', MockData.coverageStats.answeredQuestions.value.toLocaleString('zh-CN'));
  setTextOrPlaceholder('stat-coverage-rate', String(MockData.coverageStats.coverageRate.value));

  coverageBoardState = {
    totalQuestions: MockData.coverageStats.totalQuestions.value,
    answeredQuestions: MockData.coverageStats.answeredQuestions.value
  };
}

function setTableLoading(tbodyId, colSpan) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;color:#9CA3AF;">加载中...</td></tr>`;
}

function setTextOrPlaceholder(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = value;
}

function animateValue(elementId, start, end, duration) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const range = end - start;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(start + range * easeProgress);

    element.textContent = current.toLocaleString('zh-CN');

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

function renderUnansweredCoverageBoard() {
  renderCoverageCategoryRows('general-questions-body', coverageCategoryState.generalRows || []);
  renderCoverageCategoryRows('product-questions-body', coverageCategoryState.productRows || []);
}

function buildUnansweredCoverageData(totalQuestions, answeredQuestions) {
  const board = MockData.unansweredDetailBoard;
  const unresolvedQuestions = Math.max(totalQuestions - answeredQuestions, 0);

  const presaleConsult = Math.round(totalQuestions * board.summaryDistribution.presaleConsultShare);
  const aftersaleConsult = Math.max(totalQuestions - presaleConsult, 0);
  const presaleAnswered = Math.min(
    presaleConsult,
    Math.round(answeredQuestions * board.summaryDistribution.presaleAnsweredShare)
  );
  const aftersaleAnswered = Math.min(
    aftersaleConsult,
    Math.max(answeredQuestions - presaleAnswered, 0)
  );

  const generalConsultTotal = Math.round(totalQuestions * 0.54);
  const productConsultTotal = Math.max(totalQuestions - generalConsultTotal, 0);
  const generalUnansweredTotal = Math.round(unresolvedQuestions * 0.58);
  const productUnansweredTotal = Math.max(unresolvedQuestions - generalUnansweredTotal, 0);

  return {
    summaryRows: [
      {
        label: '售前',
        totalQuestions: presaleConsult,
        answeredQuestions: presaleAnswered,
        coverageRate: percentage(presaleAnswered, presaleConsult)
      },
      {
        label: '售后',
        totalQuestions: aftersaleConsult,
        answeredQuestions: aftersaleAnswered,
        coverageRate: percentage(aftersaleAnswered, aftersaleConsult)
      }
    ],
    generalRows: buildCategoryRows(board.generalQuestionTemplates, generalConsultTotal, generalUnansweredTotal),
    productRows: buildCategoryRows(board.productQuestionTemplates, productConsultTotal, productUnansweredTotal)
  };
}

function buildCategoryRows(templates, totalConsult, totalUnanswered) {
  const consultDistribution = distributeByWeights(templates, 'consultShare', totalConsult);
  const unansweredDistribution = distributeByWeights(templates, 'unansweredShare', totalUnanswered);

  return templates.map((template, index) => {
    const consultCount = consultDistribution[index];
    const unansweredCount = Math.min(unansweredDistribution[index], consultCount);
    const robotReplyCount = Math.max(consultCount - unansweredCount, 0);

    return {
      key: template.key,
      label: template.label,
      subLabel: template.subLabel,
      consultCount,
      robotReplyCount,
      replyRate: percentage(robotReplyCount, consultCount),
      unansweredCount
    };
  });
}

function distributeByWeights(items, key, total) {
  if (!items.length) return [];

  const weights = items.map(item => {
    const value = Number(item[key] ?? item.weight ?? 1);
    return Number.isFinite(value) && value > 0 ? value : 1;
  });
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || items.length;
  const raw = weights.map(weight => total * (weight / totalWeight));
  const values = raw.map(value => Math.floor(value));
  let rest = total - values.reduce((sum, value) => sum + value, 0);

  const sortedIndexes = raw
    .map((value, index) => ({ index, decimal: value - Math.floor(value) }))
    .sort((a, b) => b.decimal - a.decimal)
    .map(item => item.index);

  let pointer = 0;
  while (rest > 0 && sortedIndexes.length > 0) {
    const index = sortedIndexes[pointer % sortedIndexes.length];
    values[index] += 1;
    rest -= 1;
    pointer += 1;
  }

  return values;
}

function renderCoverageSummaryRows(rows) {
  const tbody = document.getElementById('coverage-summary-body');
  if (!tbody) return;

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td><div class="table-cell-main">${row.label}</div></td>
      <td>${row.totalQuestions.toLocaleString('zh-CN')}</td>
      <td>${row.answeredQuestions.toLocaleString('zh-CN')}</td>
      <td>${formatPercent(row.coverageRate)}%</td>
    </tr>
  `).join('');
}

function renderCoverageCategoryRows(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const groupType = tbodyId === 'general-questions-body' ? 'general' : 'product';
  const problemType = groupType === 'general' ? '通用问法' : '商品问法';
  const expandedGroups = coverageCategoryExpandState[groupType];
  const groupedRows = groupCoverageRows(rows);

  tbody.innerHTML = groupedRows.map(group => {
    const expanded = expandedGroups.has(group.label);
    const groupActionText = expanded ? '收起细分场景' : '展开细分场景';

    const childRows = expanded
      ? group.items.map(row => `
        <tr class="coverage-child-row">
          <td>
            <div class="coverage-child-placeholder">--</div>
          </td>
          <td>
            <div class="category-sub-label coverage-child-sub-label">${row.subLabel}</div>
          </td>
          <td>${row.consultCount.toLocaleString('zh-CN')}</td>
          <td>${row.robotReplyCount.toLocaleString('zh-CN')}</td>
          <td>${formatPercent(row.replyRate)}%</td>
          <td>${row.unansweredCount.toLocaleString('zh-CN')}</td>
          <td>
            ${row.unansweredCount > 0
              ? `<a href="#"
                  class="link-text"
                  data-detail-key="${row.key}"
                  data-detail-level1-code="${row.level1Code || ''}"
                  data-detail-parent-code="${row.labelCode || ''}"
                  data-detail-sub-code="${row.subLabelCode || ''}"
                  data-detail-type="${problemType}"
                  data-detail-parent="${row.label}"
                  data-detail-sub="${row.subLabel}"
                  data-detail-count="${row.unansweredCount}">
                  查看未回复明细
                </a>`
              : '<span class="table-cell-sub">--</span>'}
          </td>
        </tr>
      `).join('')
      : '';

    return `
      <tr class="coverage-group-row ${expanded ? 'expanded' : ''}" data-group-toggle="true" data-group-type="${groupType}" data-group-label="${group.label}">
        <td>
          <div class="coverage-group-label">
            <span class="coverage-group-arrow">${expanded ? '▾' : '▸'}</span>
            <div>
              <div class="table-cell-main">${group.label}</div>
              <div class="table-cell-sub">${group.items.length} 个细分场景</div>
            </div>
          </div>
        </td>
        <td><span class="table-cell-sub">${expanded ? '已展开细分场景' : '点击展开查看细分场景'}</span></td>
        <td>${group.consultCount.toLocaleString('zh-CN')}</td>
        <td>${group.robotReplyCount.toLocaleString('zh-CN')}</td>
        <td>${formatPercent(group.replyRate)}%</td>
        <td>${group.unansweredCount.toLocaleString('zh-CN')}</td>
        <td><span class="link-text coverage-group-action">${groupActionText}</span></td>
      </tr>
      ${childRows}
    `;
  }).join('');
}

function groupCoverageRows(rows) {
  const groups = new Map();

  rows.forEach(row => {
    if (!groups.has(row.label)) {
      groups.set(row.label, {
        label: row.label,
        items: [],
        consultCount: 0,
        robotReplyCount: 0,
        unansweredCount: 0
      });
    }

    const group = groups.get(row.label);
    group.items.push(row);
    group.consultCount += row.consultCount;
    group.robotReplyCount += row.robotReplyCount;
    group.unansweredCount += row.unansweredCount;
  });

  return Array.from(groups.values()).map(group => ({
    ...group,
    replyRate: percentage(group.robotReplyCount, group.consultCount)
  }));
}

function initCoverageCategoryToggle() {
  document.addEventListener('click', event => {
    const groupRow = event.target.closest('[data-group-toggle="true"]');
    if (!groupRow) return;
    if (event.target.closest('[data-detail-key]')) return;

    const groupType = groupRow.dataset.groupType;
    const groupLabel = groupRow.dataset.groupLabel;
    const expandedGroups = coverageCategoryExpandState[groupType];
    if (!expandedGroups || !groupLabel) return;

    if (expandedGroups.has(groupLabel)) {
      expandedGroups.delete(groupLabel);
    } else {
      expandedGroups.add(groupLabel);
    }

    renderUnansweredCoverageBoard();
  });
}

function initUnansweredDetailModal() {
  const modal = document.getElementById('unanswered-detail-modal');
  const closeBtn = document.getElementById('unanswered-detail-close');

  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) {
      modal.classList.remove('show');
    }
  });

  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-detail-key]');
    if (!trigger) return;

    event.preventDefault();
    void openUnansweredDetailModal({
      detailKey: trigger.dataset.detailKey,
      level1Code: trigger.dataset.detailLevel1Code || '',
      parentCode: trigger.dataset.detailParentCode || '',
      subCode: trigger.dataset.detailSubCode || '',
      problemType: trigger.dataset.detailType || '未回复问题',
      parentLabel: trigger.dataset.detailParent || '--',
      subLabel: trigger.dataset.detailSub || '--',
      unansweredCount: Number(trigger.dataset.detailCount || 0)
    });
  });

  const uploadBtn = document.getElementById('detail-upload-doc-btn');
  const confirmBtn = document.getElementById('detail-confirm-doc-btn');
  const testBtn = document.getElementById('detail-mock-test-btn');
  const fileInput = document.getElementById('detail-kb-file-input');
  const pickerModal = document.getElementById('detail-kb-picker-modal');
  const pickerClose = document.getElementById('detail-kb-picker-close');
  const pickerCancel = document.getElementById('detail-kb-picker-cancel');
  const pickerConfirm = document.getElementById('detail-kb-picker-confirm');

  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (!detailKnowledgeBaseEnabled) {
        window.alert('知识库代理未配置，当前无法上传知识文档。');
        return;
      }
      fileInput?.click();
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      window.alert('当前卡片里的文档绑定会实时保存；如果你修改了 chunk 内容，请在“查看切片”弹层里点击“保存修改”。');
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      await runDetailKnowledgeMockCheck();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', async event => {
      const files = Array.from(event.target.files || []);
      event.target.value = '';
      if (!files.length) return;
      await handleDetailKnowledgeUpload(files);
    });
  }

  if (pickerClose) {
    pickerClose.addEventListener('click', () => {
      setDetailKnowledgePickerVisible(false);
    });
  }

  if (pickerCancel) {
    pickerCancel.addEventListener('click', () => {
      setDetailKnowledgePickerVisible(false);
    });
  }

  if (pickerModal) {
    pickerModal.addEventListener('click', event => {
      if (event.target === pickerModal) {
        setDetailKnowledgePickerVisible(false);
      }
    });
  }

  document.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-detail-kb-open-picker]');
    if (!trigger) return;
    event.preventDefault();
    await toggleDetailKnowledgePicker();
  });

  document.addEventListener('click', async event => {
    const option = event.target.closest('[data-kb-doc-id]');
    if (!option) return;
    if (!option.closest('#detail-kb-picker-body')) return;

    const docId = option.dataset.kbDocId || '';
    if (!docId) return;
    toggleDetailKnowledgeSelection(docId);
    renderDetailKnowledgePicker();
  });

  if (pickerConfirm) {
    pickerConfirm.addEventListener('click', async () => {
      await confirmDetailKnowledgeSelection();
    });
  }

  document.addEventListener('click', async event => {
    const action = event.target.closest('[data-bound-doc-action]');
    if (!action) return;
    if (!action.closest('#detail-kb-status')) return;

    const docId = action.dataset.docId || '';
    const docName = action.dataset.docName || '';
    const docType = action.dataset.docType || '';
    const processStatus = Number(action.dataset.docStatus || 0);
    const operation = action.dataset.boundDocAction || '';

    if (!docId || !operation) return;
    event.preventDefault();
    event.stopPropagation();

    if (operation === 'activate') {
      unansweredDetailModalState.activeDocId = docId;
      renderDetailKnowledgeStatus('已切换当前测试文档');
      return;
    }

    if (operation === 'remove') {
      if (!window.confirm(`确认解除「${docName || docId}」与当前细分场景的绑定吗？`)) {
        return;
      }
      try {
        await removeDetailKnowledgeLink(docId);
        renderDetailKnowledgeStatus('已解除绑定');
      } catch (error) {
        renderDetailKnowledgeStatus(`解除绑定失败：${error?.message || '未知错误'}`);
      }
      return;
    }

    if (operation === 'chunks') {
      openDetailChunkModal({
        docId,
        docName,
        docType,
        processStatus
      });
    }
  });
}

async function openUnansweredDetailModal({ detailKey, level1Code, parentCode, subCode, problemType, parentLabel, subLabel, unansweredCount }) {
  const modal = document.getElementById('unanswered-detail-modal');
  const title = document.getElementById('unanswered-detail-title');
  const subtitle = document.getElementById('unanswered-detail-subtitle');
  const tbody = document.getElementById('unanswered-detail-body');
  const typeEl = document.getElementById('detail-problem-type');
  const parentEl = document.getElementById('detail-parent-label');
  const subEl = document.getElementById('detail-sub-label');
  const typeCountEl = document.getElementById('detail-unanswered-type-count');
  const parentCountEl = document.getElementById('detail-unanswered-parent-count');
  const subCountEl = document.getElementById('detail-unanswered-sub-count');

  if (!modal || !title || !subtitle || !tbody || !typeEl || !parentEl || !subEl || !typeCountEl || !parentCountEl || !subCountEl) {
    return;
  }

  unansweredDetailModalState = {
    detailKey,
    level1Code,
    parentCode,
    subCode,
    problemType,
    parentLabel,
    subLabel,
    unansweredCount,
    detailItems: [],
    files: [],
    loadingFiles: false,
    linkedDocs: [],
    activeDocId: '',
    pickerSelectedDocIds: [],
    lastTestResult: null
  };

  title.textContent = `${parentLabel} / ${subLabel} 未回复问题明细`;
  subtitle.textContent = `当前展示该分类下的未回复问题摘要，可继续查看会话内容确认具体问题。`;
  typeEl.textContent = problemType;
  parentEl.textContent = parentLabel;
  subEl.textContent = subLabel;
  typeCountEl.textContent = `未回复 ${unansweredCount}`;
  parentCountEl.textContent = `未回复 ${unansweredCount}`;
  subCountEl.textContent = `未回复 ${unansweredCount}`;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">正在加载明细...</td></tr>';

  renderDetailTestResult();
  setDetailKnowledgePickerVisible(false);
  renderDetailKnowledgeStatus('正在加载已绑定知识文档...');
  modal.classList.add('show');
  await loadCategoryDetailItems();
  void syncDetailKnowledgeBinding();
}

async function loadCategoryDetailItems() {
  const tbody = document.getElementById('unanswered-detail-body');
  if (!tbody) return;

  try {
    const response = await getCustomerServiceCategoryDetailFromDb({
      ...currentFilterParams,
      scene_level1_code: unansweredDetailModalState.level1Code,
      scene_level2_code: unansweredDetailModalState.parentCode,
      scene_level3_code: unansweredDetailModalState.subCode,
      limit: Math.max(unansweredDetailModalState.unansweredCount, 20)
    });

    const detailItems = Array.isArray(response?.data?.questions)
      ? response.data.questions.map(item => ({
        buyerNick: item.buyer_nick || '-',
        sellerNick: item.seller_nick || '-',
        issue: item.issue || `${unansweredDetailModalState.parentLabel} / ${unansweredDetailModalState.subLabel}`,
        question: item.question || '未提供问题内容',
        createdAt: item.created_at || '--',
        conversationId: item.conversation_id || ''
      }))
      : [];

    unansweredDetailModalState.detailItems = detailItems;

    if (detailItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">暂无明细数据</td></tr>';
      return;
    }

    tbody.innerHTML = detailItems.map(item => `
      <tr>
        <td>${escapeHtml(item.buyerNick)}</td>
        <td>
          <div class="table-cell-main unanswered-question-cell">${escapeHtml(item.question)}</div>
          <div class="table-cell-sub">${escapeHtml(item.issue)}</div>
        </td>
        <td><span class="tag warning">否</span></td>
        <td>${escapeHtml(item.createdAt)}</td>
        <td>${item.conversationId ? `<a href="#" class="link-text" data-conversation-id="${escapeHtml(item.conversationId)}">查看具体内容</a>` : '<span class="table-cell-sub">--</span>'}</td>
      </tr>
    `).join('');
  } catch (error) {
    unansweredDetailModalState.detailItems = [];
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#EF4444;">加载明细失败：${escapeHtml(error?.message || '未知错误')}</td></tr>`;
  }
}

function buildGenericDetailItems({ parentLabel, subLabel, unansweredCount, detailKey }) {
  const count = Math.min(Math.max(unansweredCount, 1), 3);

  return Array.from({ length: count }, (_, index) => ({
    buyerNick: `sample_user_${index + 1}`,
    sellerNick: '旗舰店客服',
    issue: `${parentLabel} / ${subLabel} 标签问题待补充`,
    question: `关于「${subLabel}」的第 ${index + 1} 条未回复问题示例`,
    createdAt: `2026-03-${String(15 - index).padStart(2, '0')} 10:${String(12 + index * 7).padStart(2, '0')}`,
    conversationId: `mock-${detailKey}-${index + 1}`
  }));
}

function getCurrentDetailKnowledgeLink() {
  const activeDocId = unansweredDetailModalState.activeDocId;
  if (!activeDocId) {
    return unansweredDetailModalState.linkedDocs[0] || null;
  }
  return unansweredDetailModalState.linkedDocs.find(item => item.docId === activeDocId) || unansweredDetailModalState.linkedDocs[0] || null;
}

async function saveDetailKnowledgeLink({
  docId,
  docName,
  processStatus,
  bindingSource = 'manual',
  docType = '',
  collectionName = '',
  resourceId = '',
  project = ''
}) {
  const payload = {
    problem_type: unansweredDetailModalState.problemType,
    parent_label: unansweredDetailModalState.parentLabel,
    sub_label: unansweredDetailModalState.subLabel,
    doc_id: docId,
    doc_name: docName,
    doc_type: docType || null,
    process_status: processStatus,
    binding_source: bindingSource,
    collection_name: collectionName || null,
    resource_id: resourceId || null,
    project: project || null
  };

  const normalized = detailKnowledgeBaseEnabled
    ? normalizeCoverageBindingRecord((await saveCoverageSceneBinding(payload)).record, payload)
    : normalizeCoverageBindingRecord(payload, payload);

  upsertDetailKnowledgeLink(normalized);
  unansweredDetailModalState.activeDocId = normalized?.docId || unansweredDetailModalState.activeDocId;
  return normalized;
}

async function removeDetailKnowledgeLink(docId) {
  if (detailKnowledgeBaseEnabled) {
    await deleteCoverageSceneBinding({
      problem_type: unansweredDetailModalState.problemType,
      parent_label: unansweredDetailModalState.parentLabel,
      sub_label: unansweredDetailModalState.subLabel,
      doc_id: docId
    });
  }

  unansweredDetailModalState.linkedDocs = unansweredDetailModalState.linkedDocs.filter(item => item.docId !== docId);
  if (unansweredDetailModalState.activeDocId === docId) {
    unansweredDetailModalState.activeDocId = unansweredDetailModalState.linkedDocs[0]?.docId || '';
  }
}

function upsertDetailKnowledgeLink(record) {
  if (!record?.docId) return;
  const next = unansweredDetailModalState.linkedDocs.filter(item => item.docId !== record.docId);
  next.unshift(record);
  unansweredDetailModalState.linkedDocs = next;
}

async function syncDetailKnowledgeBinding() {
  if (!detailKnowledgeBaseEnabled) {
    unansweredDetailModalState.linkedDocs = [];
    unansweredDetailModalState.activeDocId = '';
    renderDetailKnowledgeStatus();
    return;
  }

  try {
    const result = await listCoverageSceneBindings({
      problem_type: unansweredDetailModalState.problemType,
      parent_label: unansweredDetailModalState.parentLabel,
      sub_label: unansweredDetailModalState.subLabel
    });
    unansweredDetailModalState.linkedDocs = (result.records || [])
      .map(record => normalizeCoverageBindingRecord(record))
      .filter(Boolean);
    unansweredDetailModalState.activeDocId = unansweredDetailModalState.linkedDocs[0]?.docId || '';
    renderDetailKnowledgeStatus();
  } catch (error) {
    unansweredDetailModalState.linkedDocs = [];
    unansweredDetailModalState.activeDocId = '';
    renderDetailKnowledgeStatus(`加载绑定关系失败：${error?.message || '未知错误'}`);
  }
}

function renderDetailKnowledgeStatus(message = '') {
  const statusEl = document.getElementById('detail-kb-status');
  const uploadBtn = document.getElementById('detail-upload-doc-btn');
  const confirmBtn = document.getElementById('detail-confirm-doc-btn');
  if (!statusEl) return;

  const links = unansweredDetailModalState.linkedDocs || [];
  const activeLink = getCurrentDetailKnowledgeLink();

  if (!detailKnowledgeBaseEnabled) {
    statusEl.innerHTML = '<span class="detail-kb-status-empty">知识库代理未配置，当前无法上传或绑定文档</span>';
    uploadBtn?.setAttribute('disabled', 'disabled');
    confirmBtn?.setAttribute('disabled', 'disabled');
    return;
  }

  uploadBtn?.removeAttribute('disabled');
  confirmBtn?.removeAttribute('disabled');

  if (links.length === 0) {
    statusEl.innerHTML = `
      <div class="detail-kb-status-main">未关联知识文档</div>
      <div class="detail-kb-status-sub">${message || '可先上传新文档，或从现有知识库文件中选择后绑定到当前细分场景'}</div>
      <div class="detail-kb-status-actions">
        <button type="button" class="detail-kb-status-action-btn" data-detail-kb-open-picker>绑定已有知识文档</button>
      </div>
    `;
    return;
  }

  statusEl.innerHTML = `
    <div class="detail-kb-status-main">已关联 ${links.length} 份知识文档${message ? ` · ${escapeHtml(message)}` : ''}</div>
    <div class="detail-kb-status-sub">当前测试文档：${escapeHtml(activeLink?.docName || '未选择')}</div>
    <div class="detail-kb-status-actions">
      <button type="button" class="detail-kb-status-action-btn" data-detail-kb-open-picker>继续绑定已有知识文档</button>
    </div>
    <div class="detail-kb-binding-list">
      ${links.map(link => `
        <div class="detail-kb-binding-card ${link.docId === activeLink?.docId ? 'active' : ''}">
          <div class="detail-kb-binding-main">
            <div class="detail-kb-binding-title">${escapeHtml(link.docName || link.docId)}</div>
            <div class="detail-kb-binding-meta">
              <span>${escapeHtml(String(link.docType || '').toUpperCase() || '--')}</span>
              <span>${formatKnowledgeProcessStatus(link.processStatus)}</span>
              <span>${escapeHtml(link.bindingSource || 'manual')}</span>
            </div>
          </div>
          <div class="detail-kb-binding-actions">
            <button type="button" class="detail-kb-mini-btn" data-bound-doc-action="activate" data-doc-id="${escapeHtml(link.docId)}" data-doc-name="${escapeHtml(link.docName || '')}" data-doc-type="${escapeHtml(link.docType || '')}" data-doc-status="${Number(link.processStatus ?? 0)}">${link.docId === activeLink?.docId ? '当前测试文档' : '设为测试文档'}</button>
            <button type="button" class="detail-kb-mini-btn" data-bound-doc-action="chunks" data-doc-id="${escapeHtml(link.docId)}" data-doc-name="${escapeHtml(link.docName || '')}" data-doc-type="${escapeHtml(link.docType || '')}" data-doc-status="${Number(link.processStatus ?? 0)}">查看切片</button>
            <button type="button" class="detail-kb-mini-btn danger" data-bound-doc-action="remove" data-doc-id="${escapeHtml(link.docId)}" data-doc-name="${escapeHtml(link.docName || '')}" data-doc-type="${escapeHtml(link.docType || '')}" data-doc-status="${Number(link.processStatus ?? 0)}">解除绑定</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function setDetailKnowledgePickerVisible(visible) {
  const pickerModal = document.getElementById('detail-kb-picker-modal');
  if (!pickerModal) return;
  pickerModal.classList.toggle('show', visible);
}

async function toggleDetailKnowledgePicker() {
  const pickerModal = document.getElementById('detail-kb-picker-modal');
  if (!pickerModal) return;

  const shouldShow = !pickerModal.classList.contains('show');
  if (!shouldShow) {
    setDetailKnowledgePickerVisible(false);
    return;
  }

  unansweredDetailModalState.pickerSelectedDocIds = (unansweredDetailModalState.linkedDocs || []).map(item => item.docId);
  setDetailKnowledgePickerVisible(true);
  await loadDetailKnowledgeFiles();
}

async function loadDetailKnowledgeFiles() {
  const body = document.getElementById('detail-kb-picker-body');
  if (!body) return;

  unansweredDetailModalState.loadingFiles = true;
  body.innerHTML = '<div class="detail-kb-picker-loading">正在加载知识库文件...</div>';

  try {
    const result = await listKnowledgeBaseFiles({ limit: 50, return_token_usage: true });
    unansweredDetailModalState.files = sortKnowledgeFilesForContext(
      result.records || [],
      unansweredDetailModalState
    );
    renderDetailKnowledgePicker();
  } catch (error) {
    body.innerHTML = `<div class="detail-kb-picker-empty">加载知识库文件失败：${escapeHtml(error?.message || '未知错误')}</div>`;
  } finally {
    unansweredDetailModalState.loadingFiles = false;
  }
}

function renderDetailKnowledgePicker() {
  const body = document.getElementById('detail-kb-picker-body');
  const summary = document.getElementById('detail-kb-picker-summary');
  if (!body) return;

  const files = unansweredDetailModalState.files || [];
  const selectedDocIds = new Set(unansweredDetailModalState.pickerSelectedDocIds || []);

  if (summary) {
    summary.textContent = selectedDocIds.size > 0
      ? `已选择 ${selectedDocIds.size} 份文档，点击“确定绑定”后统一保存`
      : '可多选绑定，已绑定文档会默认选中';
  }

  if (!files.length) {
    body.innerHTML = '<div class="detail-kb-picker-empty">当前知识库没有可选文件，请先上传文档。</div>';
    return;
  }

  body.innerHTML = files.map(file => {
    const processStatus = Number(file?.status?.process_status ?? 0);
    const isSelected = selectedDocIds.has(String(file.doc_id || ''));
    const matchScore = scoreKnowledgeFile(file, unansweredDetailModalState);

    return `
      <button
        type="button"
        class="detail-kb-file-option ${isSelected ? 'selected' : ''}"
        data-kb-doc-id="${escapeHtml(file.doc_id || '')}"
        data-kb-doc-name="${escapeHtml(file.doc_name || '')}"
        data-kb-doc-status="${processStatus}"
        data-kb-doc-type="${escapeHtml(file.doc_type || '')}">
        <div class="detail-kb-file-main">
          <span class="detail-kb-file-name">${escapeHtml(file.doc_name || file.doc_id || '未命名文档')}</span>
          ${matchScore > 0 ? '<span class="detail-kb-file-badge">建议匹配</span>' : ''}
        </div>
        <div class="detail-kb-file-meta">
          <span>${escapeHtml(String(file.doc_type || '').toUpperCase() || '--')}</span>
          <span>${formatKnowledgeProcessStatus(processStatus)}</span>
          <span>${formatDateTime(file.update_time)}</span>
        </div>
      </button>
    `;
  }).join('');
}

function sortKnowledgeFilesForContext(files, context) {
  return [...files].sort((a, b) => {
    const scoreDiff = scoreKnowledgeFile(b, context) - scoreKnowledgeFile(a, context);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(b?.update_time || 0) - Number(a?.update_time || 0);
  });
}

function toggleDetailKnowledgeSelection(docId) {
  const current = new Set(unansweredDetailModalState.pickerSelectedDocIds || []);
  if (current.has(docId)) {
    current.delete(docId);
  } else {
    current.add(docId);
  }
  unansweredDetailModalState.pickerSelectedDocIds = Array.from(current);
}

async function confirmDetailKnowledgeSelection() {
  const selectedDocIds = new Set(unansweredDetailModalState.pickerSelectedDocIds || []);
  const currentLinks = unansweredDetailModalState.linkedDocs || [];
  const currentDocIds = new Set(currentLinks.map(item => item.docId));
  const filesById = new Map((unansweredDetailModalState.files || []).map(file => [String(file.doc_id || ''), file]));
  const pickerConfirm = document.getElementById('detail-kb-picker-confirm');
  const originalText = pickerConfirm?.textContent || '确定绑定';

  if (pickerConfirm) {
    pickerConfirm.disabled = true;
    pickerConfirm.textContent = '保存中...';
  }

  try {
    for (const link of currentLinks) {
      if (!selectedDocIds.has(link.docId)) {
        await removeDetailKnowledgeLink(link.docId);
      }
    }

    for (const docId of selectedDocIds) {
      if (currentDocIds.has(docId)) continue;
      const file = filesById.get(docId);
      if (!file) continue;
      await saveDetailKnowledgeLink({
        docId,
        docName: file.doc_name || docId,
        processStatus: Number(file?.status?.process_status ?? 0),
        bindingSource: 'existing',
        docType: file.doc_type || '',
        collectionName: file.collection_name || '',
        resourceId: file.resource_id || '',
        project: file.project || ''
      });
    }

    setDetailKnowledgePickerVisible(false);
    renderDetailKnowledgeStatus('绑定关系已更新');
  } catch (error) {
    renderDetailKnowledgeStatus(`保存绑定失败：${error?.message || '未知错误'}`);
  } finally {
    if (pickerConfirm) {
      pickerConfirm.disabled = false;
      pickerConfirm.textContent = originalText;
    }
  }
}

function scoreKnowledgeFile(file, context) {
  const name = String(file?.doc_name || '').toLowerCase();
  const parent = String(context?.parentLabel || '').toLowerCase();
  const sub = String(context?.subLabel || '').toLowerCase();
  let score = 0;
  if (sub && name.includes(sub)) score += 3;
  if (parent && name.includes(parent)) score += 2;
  return score;
}

async function handleDetailKnowledgeUpload(files) {
  if (!detailKnowledgeBaseEnabled) return;

  renderDetailKnowledgeStatus('正在上传知识文档...');

  try {
    const result = await uploadKnowledgeBaseFiles(files);
    const firstItem = Array.isArray(result.items) ? result.items[0] : null;
    if (!firstItem?.doc_id) {
      throw new Error('上传成功，但未返回文档标识');
    }

    await saveDetailKnowledgeLink({
      docId: firstItem.doc_id,
      docName: firstItem.doc_name || files[0]?.name || firstItem.doc_id,
      processStatus: Number(firstItem?.data?.data?.status?.process_status ?? 2),
      bindingSource: 'upload',
      docType: inferFileExtension(firstItem.doc_name || files[0]?.name || '')
    });
    renderDetailKnowledgeStatus('上传成功，已自动绑定到当前细分场景');
    await loadDetailKnowledgeFiles();
  } catch (error) {
    renderDetailKnowledgeStatus(`上传失败：${error?.message || '未知错误'}`);
  }
}

async function runDetailKnowledgeMockCheck() {
  const testBtn = document.getElementById('detail-mock-test-btn');
  const link = getCurrentDetailKnowledgeLink();
  const detailItems = Array.isArray(unansweredDetailModalState.detailItems)
    ? unansweredDetailModalState.detailItems.filter(item => item.conversationId)
    : [];

  if (!detailItems.length) {
    unansweredDetailModalState.lastTestResult = {
      tone: 'warning',
      title: '暂无可回测问题',
      summary: '当前分类下没有可用于回测的历史问题明细。',
      testedAt: new Date().toISOString()
    };
    renderDetailTestResult();
    window.alert('当前分类下没有可用于回测的历史问题明细。');
    return;
  }

  const originalText = testBtn?.firstChild?.textContent || '开始历史问题回测';
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.firstChild.textContent = '历史问题回测中';
  }

  try {
    const response = await runCustomerServiceCoverageBacktest({
      conversation_ids: detailItems.map(item => item.conversationId)
    });

    unansweredDetailModalState.lastTestResult = buildCoverageBacktestResult({
      response,
      detailItems,
      docName: link?.docName || '',
      processStatus: link?.processStatus,
      pointNum: null
    });
    renderDetailTestResult();
    window.alert(`历史问题回测已完成：共回测 ${detailItems.length} 条问题，结果已展示在按钮下方。`);
  } catch (error) {
    unansweredDetailModalState.lastTestResult = {
      tone: 'error',
      title: '历史问题回测失败',
      summary: error?.message || '未知错误',
      testedAt: new Date().toISOString(),
      docName: link?.docName || link?.docId || ''
    };
    renderDetailTestResult();
    window.alert(`历史问题回测失败：${error?.message || '未知错误'}`);
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.firstChild.textContent = originalText;
    }
  }
}

function formatKnowledgeProcessStatus(processStatus) {
  return DETAIL_KB_STATUS_LABELS[processStatus] || `状态 ${processStatus}`;
}

function renderDetailTestResult() {
  const container = document.getElementById('detail-test-result');
  if (!container) return;

  const result = unansweredDetailModalState.lastTestResult;
  if (!result) {
    container.className = 'detail-test-result hidden';
    container.innerHTML = '';
    return;
  }

  const tone = ['success', 'warning', 'error'].includes(result.tone) ? result.tone : '';
  const cases = Array.isArray(result.cases) ? result.cases : [];
  container.className = `detail-test-result ${tone}`.trim();
  container.innerHTML = `
    <div class="detail-test-result-title">${escapeHtml(result.title || '最近一次历史问题回测结果')}</div>
    <div class="detail-test-result-main">${escapeHtml(result.summary || '--')}</div>
    <div class="detail-test-result-meta">
      ${result.docName ? `<span>测试文档：${escapeHtml(result.docName)}</span>` : ''}
      ${result.processStatus !== undefined ? `<span>文档状态：${escapeHtml(formatKnowledgeProcessStatus(result.processStatus))}</span>` : ''}
      ${result.pointNum !== undefined ? `<span>切片数：${escapeHtml(String(result.pointNum))}</span>` : ''}
      ${result.testedAt ? `<span>测试时间：${escapeHtml(formatDateTime(result.testedAt))}</span>` : ''}
    </div>
    ${result.metrics ? `
      <div class="detail-test-metrics">
        <div class="detail-test-metric">
          <div class="detail-test-metric-label">回测问题数</div>
          <div class="detail-test-metric-value">${escapeHtml(String(result.metrics.total || 0))}</div>
        </div>
        <div class="detail-test-metric">
          <div class="detail-test-metric-label">命中覆盖数</div>
          <div class="detail-test-metric-value">${escapeHtml(String(result.metrics.hit || 0))}</div>
        </div>
        <div class="detail-test-metric">
          <div class="detail-test-metric-label">覆盖率</div>
          <div class="detail-test-metric-value">${escapeHtml(result.metrics.coverageRate || '0%')}</div>
        </div>
        <div class="detail-test-metric">
          <div class="detail-test-metric-label">回复可用率</div>
          <div class="detail-test-metric-value">${escapeHtml(result.metrics.usableRate || '0%')}</div>
        </div>
      </div>
    ` : ''}
    ${cases.length ? `
      <div class="detail-test-cases">
        <div class="detail-test-cases-head">
          <div>历史问题</div>
          <div>覆盖结果</div>
          <div>执行动作</div>
          <div>回测回复内容</div>
          <div>回复评价</div>
        </div>
        ${cases.map(item => `
          <div class="detail-test-case">
            <div>
              <div class="detail-test-case-main">${escapeHtml(item.question || '--')}</div>
              <div class="detail-test-case-sub">${escapeHtml(item.issue || '')}</div>
            </div>
            <div><span class="detail-test-pill ${item.hit ? 'hit' : 'miss'}">${item.hit ? '已覆盖' : '未覆盖'}</span></div>
            <div>
              <div class="detail-test-case-main">${escapeHtml(item.chunkTitle || '--')}</div>
              <div class="detail-test-case-sub">${escapeHtml(item.chunkHint || '')}</div>
            </div>
            <div>
              <div class="detail-test-case-main">${escapeHtml(item.reply || '--')}</div>
            </div>
            <div><span class="detail-test-pill ${item.assessment === '可直接使用' ? 'good' : 'partial'}">${escapeHtml(item.assessment || '--')}</span></div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <div class="detail-test-result-note">当前面板展示的是历史问题回测结果：按历史会话逐条调用回测接口，判断是否命中可回复内容。</div>
  `;
}

function buildMockBacktestResult({ docName, processStatus, pointNum, detailItems, parentLabel, subLabel }) {
  const items = Array.isArray(detailItems) ? detailItems.slice(0, 5) : [];
  const cases = items.map((item, index) => {
    const hit = processStatus === 0 ? index % 3 !== 1 : index === 0;
    const usable = hit && index % 2 === 0;
    return {
      question: item.question,
      issue: item.issue,
      hit,
      chunkTitle: hit ? `${subLabel} · Chunk ${index + 1}` : '--',
      chunkHint: hit ? `${parentLabel} 相关知识片段` : '当前未命中可用知识',
      reply: hit
        ? `【模拟回复】关于“${item.question}”，当前知识文档已能提供对应说明，建议优先返回标准话术后再根据上下文补充。`
        : `【模拟回复】当前知识库里还没有足够覆盖“${item.question}”的内容，建议补充对应 chunk 或完善场景话术。`,
      assessment: hit ? (usable ? '可直接使用' : '需人工润色') : '需补充知识'
    };
  });

  const total = cases.length;
  const hit = cases.filter(item => item.hit).length;
  const usable = cases.filter(item => item.assessment === '可直接使用').length;

  return {
    tone: processStatus === 0 ? 'success' : 'warning',
    title: '历史问题回测结果',
    summary: processStatus === 0
      ? '已基于当前绑定文档生成一版历史问题回测结果，用于预览覆盖率和回复效果。'
      : '当前文档还未完全可用，先按 mock 方式展示回测面板结构。',
    testedAt: new Date().toISOString(),
    docName,
    processStatus,
    pointNum,
    metrics: {
      total,
      hit,
      coverageRate: total ? formatPercent((hit / total) * 100) : '0%',
      usableRate: total ? formatPercent((usable / total) * 100) : '0%'
    },
    cases
  };
}

function buildCoverageBacktestResult({ response, detailItems, docName, processStatus, pointNum }) {
  const resultRows = Array.isArray(response?.data?.results) ? response.data.results : [];
  const resultMap = new Map(resultRows.map(item => [item.conversation_id || '', item]));
  const cases = detailItems.map(item => {
    const testResult = resultMap.get(item.conversationId) || {};
    const reply = String(testResult.reply || '').trim();
    const action = String(testResult.action || '').trim();
    const hit = Boolean(testResult.hit);
    const success = testResult.success !== false;
    const assessment = !success
      ? '接口异常'
      : hit
        ? '可直接使用'
        : '需补充知识';

    return {
      question: item.question,
      issue: item.issue,
      hit,
      chunkTitle: action || '--',
      chunkHint: testResult.reason ? `原因：${testResult.reason}` : (success ? '未返回额外原因' : (testResult.message || '请求失败')),
      reply: reply || (success ? '转人工' : '--'),
      assessment
    };
  });

  const total = cases.length;
  const hit = cases.filter(item => item.hit).length;
  const usable = cases.filter(item => item.assessment === '可直接使用').length;

  return {
    tone: total > 0 && hit > 0 ? 'success' : 'warning',
    title: '历史问题回测结果',
    summary: total > 0
      ? `已对当前分类下的历史问题完成真实回测，可查看每条问题的回复内容与转人工结果。`
      : '当前分类下暂无可回测的历史问题。',
    testedAt: new Date().toISOString(),
    docName: docName || undefined,
    processStatus: processStatus ?? undefined,
    pointNum: Number.isFinite(pointNum) ? pointNum : undefined,
    metrics: {
      total,
      hit,
      coverageRate: total ? formatPercent((hit / total) * 100) : '0.00',
      usableRate: total ? formatPercent((usable / total) * 100) : '0.00'
    },
    cases
  };
}

function normalizeCoverageBindingRecord(record, fallback = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  return {
    docId: record.doc_id || fallback.doc_id || fallback.docId || '',
    docName: record.doc_name || fallback.doc_name || fallback.docName || '',
    docType: record.doc_type || fallback.doc_type || fallback.docType || '',
    processStatus: record.process_status ?? fallback.process_status ?? fallback.processStatus ?? null,
    bindingSource: record.binding_source || fallback.binding_source || fallback.bindingSource || 'manual',
    collectionName: record.collection_name || fallback.collection_name || fallback.collectionName || '',
    resourceId: record.resource_id || fallback.resource_id || fallback.resourceId || '',
    project: record.project || fallback.project || '',
    updatedAt: record.updated_at || fallback.updated_at || ''
  };
}

function formatDateTime(value) {
  if (!value) return '--';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    const date = new Date(numeric * 1000);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString('zh-CN', { hour12: false });
    }
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString('zh-CN', { hour12: false });
  }
  return String(value);
}

function inferFileExtension(filename) {
  return String(filename || '').split('.').pop()?.toLowerCase() || '';
}

function createDetailChunkModalState() {
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
    error: ''
  };
}

function initDetailChunkModal() {
  const modal = document.getElementById('detail-kb-chunk-modal');
  const closeBtn = document.getElementById('detail-kb-chunk-close');
  const cancelBtn = document.getElementById('detail-kb-chunk-cancel');
  const addBtn = document.getElementById('detail-kb-chunk-add');
  const refreshBtn = document.getElementById('detail-kb-chunk-refresh');
  const saveBtn = document.getElementById('detail-kb-chunk-save');
  const list = document.getElementById('detail-kb-chunk-list');
  const fieldAdd = document.getElementById('detail-kb-chunk-field-add');
  const fieldsList = document.getElementById('detail-kb-chunk-fields-list');
  const typeInput = document.getElementById('detail-kb-chunk-type');
  const content = document.getElementById('detail-kb-chunk-content');

  if (closeBtn) closeBtn.addEventListener('click', closeDetailChunkModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeDetailChunkModal);
  if (addBtn) addBtn.addEventListener('click', startDetailChunkCreate);
  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshDetailChunkList());
  if (saveBtn) saveBtn.addEventListener('click', () => handleDetailChunkSave());
  if (fieldAdd) fieldAdd.addEventListener('click', () => {
    appendDetailChunkFieldRow();
    syncDetailChunkFieldTip();
  });
  if (content) {
    content.addEventListener('input', event => autoResizeTextarea(event.target));
  }

  if (fieldsList) {
    fieldsList.addEventListener('click', event => {
      const removeBtn = event.target.closest('[data-detail-field-remove]');
      if (!removeBtn) return;
      removeBtn.closest('.kb-chunk-field-row')?.remove();
      syncDetailChunkFieldTip();
    });
    fieldsList.addEventListener('input', event => {
      if (event.target.matches('[data-detail-field-value]')) {
        autoResizeTextarea(event.target);
      }
      syncDetailChunkFieldTip();
    });
  }

  if (typeInput) {
    typeInput.addEventListener('change', event => {
      detailChunkModalState.selectedChunkType = String(event.target.value || 'text');
      syncDetailChunkTypeUI();
      renderDetailChunkModal();
    });
  }

  if (list) {
    list.addEventListener('click', event => {
      const item = event.target.closest('[data-detail-point-id]');
      if (!item) return;
      const pointId = item.dataset.detailPointId || '';
      if (!pointId || pointId === detailChunkModalState.selectedPointId) return;
      void loadSelectedDetailChunkDetail(pointId);
    });
  }

  if (modal) {
    modal.addEventListener('click', event => {
      if (event.target === modal) {
        closeDetailChunkModal();
      }
    });
  }
}

async function openDetailChunkModal(binding) {
  detailChunkModalState = createDetailChunkModalState();
  detailChunkModalState.open = true;
  detailChunkModalState.docId = String(binding?.docId || '');
  detailChunkModalState.docName = String(binding?.docName || binding?.docId || '切片详情');
  renderDetailChunkModal();
  await refreshDetailChunkList();
}

function closeDetailChunkModal() {
  detailChunkModalState = createDetailChunkModalState();
  renderDetailChunkModal();
}

async function refreshDetailChunkList(preferredPointId = '') {
  if (!detailChunkModalState.docId) return;

  detailChunkModalState.loading = true;
  detailChunkModalState.error = '';
  renderDetailChunkModal();

  try {
    const result = await listKnowledgeBaseChunks({
      doc_id: detailChunkModalState.docId,
      limit: 100
    });
    detailChunkModalState.chunks = result.records || [];
    detailChunkModalState.totalNum = Number(result.totalNum || detailChunkModalState.chunks.length || 0);
    detailChunkModalState.loading = false;
    if (preferredPointId) {
      detailChunkModalState.selectedPointId = preferredPointId;
    } else if (!detailChunkModalState.isCreating) {
      detailChunkModalState.selectedPointId = detailChunkModalState.chunks[0]?.point_id || '';
    }
    renderDetailChunkModal();

    if (detailChunkModalState.selectedPointId) {
      await loadSelectedDetailChunkDetail(detailChunkModalState.selectedPointId);
    } else {
      detailChunkModalState.selectedChunk = null;
      renderDetailChunkModal();
    }
  } catch (error) {
    detailChunkModalState.loading = false;
    detailChunkModalState.error = error?.message || '切片列表加载失败';
    renderDetailChunkModal();
  }
}

async function loadSelectedDetailChunkDetail(pointId) {
  detailChunkModalState.isCreating = false;
  detailChunkModalState.selectedPointId = pointId;
  detailChunkModalState.detailLoading = true;
  detailChunkModalState.error = '';
  renderDetailChunkModal();

  try {
    const result = await getKnowledgeBaseChunkInfo({ point_id: pointId });
    detailChunkModalState.selectedChunk = result.record || null;
    detailChunkModalState.detailLoading = false;
    renderDetailChunkModal();
  } catch (error) {
    detailChunkModalState.detailLoading = false;
    detailChunkModalState.error = error?.message || '切片详情加载失败';
    renderDetailChunkModal();
  }
}

async function handleDetailChunkSave() {
  const contentInput = document.getElementById('detail-kb-chunk-content');
  const titleInput = document.getElementById('detail-kb-chunk-title');
  const questionInput = document.getElementById('detail-kb-chunk-question');
  const typeInput = document.getElementById('detail-kb-chunk-type');
  const fields = collectDetailChunkFields();
  const chunkType = String(typeInput?.value || detailChunkModalState.selectedChunkType || inferDetailChunkType());

  if (!detailChunkModalState.isCreating && (!detailChunkModalState.selectedPointId || !detailChunkModalState.selectedChunk)) return;

  detailChunkModalState.saving = true;
  detailChunkModalState.error = '';
  renderDetailChunkModal();

  try {
    if (detailChunkModalState.isCreating) {
      const result = await addKnowledgeBaseChunk(buildDetailChunkPayload({
        mode: 'create',
        docId: detailChunkModalState.docId,
        chunkType,
        title: titleInput?.value || '',
        question: questionInput?.value || '',
        content: contentInput?.value || '',
        fields
      }));
      const createdPointId = String(result?.data?.data?.point_id || '');
      detailChunkModalState.isCreating = false;
      detailChunkModalState.saving = false;
      await refreshDetailChunkList();
      if (createdPointId) {
        await loadSelectedDetailChunkDetail(createdPointId);
      }
      window.alert('新切片已创建');
    } else {
      await updateKnowledgeBaseChunk({
        point_id: detailChunkModalState.selectedPointId,
        chunk_title: titleInput?.value || '',
        question: questionInput?.value || '',
        content: contentInput?.value || '',
        ...(fields.length > 0 ? { fields } : {})
      });
      detailChunkModalState.saving = false;
      await loadSelectedDetailChunkDetail(detailChunkModalState.selectedPointId);
      await refreshDetailChunkList();
      window.alert('切片内容已保存');
    }
  } catch (error) {
    detailChunkModalState.saving = false;
    detailChunkModalState.error = error?.message || (detailChunkModalState.isCreating ? '切片新增失败' : '切片更新失败');
    renderDetailChunkModal();
  }
}

function renderDetailChunkModal() {
  const modal = document.getElementById('detail-kb-chunk-modal');
  if (!modal) return;

  modal.classList.toggle('show', detailChunkModalState.open);
  if (!detailChunkModalState.open) return;

  setTextOrPlaceholder('detail-kb-chunk-modal-title', detailChunkModalState.docName || '切片详情');
  setTextOrPlaceholder(
    'detail-kb-chunk-modal-subtitle',
    detailChunkModalState.totalNum
      ? `当前文档共有 ${detailChunkModalState.totalNum} 个切片，可查看详情并直接修改内容`
      : '可查看当前文档切片内容，并直接修改后提交'
  );

  const saveButton = document.getElementById('detail-kb-chunk-save');
  if (saveButton) {
    saveButton.disabled = detailChunkModalState.saving || (!detailChunkModalState.isCreating && !detailChunkModalState.selectedPointId);
    saveButton.textContent = detailChunkModalState.saving ? '保存中...' : (detailChunkModalState.isCreating ? '新增切片' : '保存修改');
  }

  renderDetailChunkList();
  renderDetailChunkDetail();
}

function renderDetailChunkList() {
  const container = document.getElementById('detail-kb-chunk-list');
  if (!container) return;

  if (detailChunkModalState.loading) {
    container.innerHTML = '<div class="kb-chunk-empty">切片列表加载中...</div>';
    return;
  }

  if (detailChunkModalState.chunks.length === 0) {
    container.innerHTML = '<div class="kb-chunk-empty">当前文档暂无切片，可点击“新增切片”创建第一条</div>';
    return;
  }

  container.innerHTML = detailChunkModalState.chunks.map((chunk, index) => {
    const pointId = String(chunk.point_id || '');
    const isActive = pointId === detailChunkModalState.selectedPointId;
    return `
      <button type="button" class="kb-chunk-item ${isActive ? 'active' : ''}" data-detail-point-id="${escapeHtml(pointId)}">
        <div class="kb-chunk-item-title">${escapeHtml(getChunkDisplayTitle(chunk, index))}</div>
        <div class="kb-chunk-item-meta">${escapeHtml(getChunkMeta(chunk))}</div>
        <div class="kb-chunk-item-preview">${escapeHtml(getChunkPreview(chunk))}</div>
      </button>
    `;
  }).join('');
}

function renderDetailChunkDetail() {
  const errorEl = document.getElementById('detail-kb-chunk-error');
  const panel = document.getElementById('detail-kb-chunk-detail-panel');
  if (errorEl) errorEl.textContent = detailChunkModalState.error || '';
  if (!panel) return;

  if (detailChunkModalState.detailLoading) {
    panel.classList.add('loading');
    return;
  }

  panel.classList.remove('loading');
  if (detailChunkModalState.isCreating) {
    populateDetailChunkForm(null);
    syncDetailChunkTypeUI();
    return;
  }
  populateDetailChunkForm(detailChunkModalState.selectedChunk);
}

function populateDetailChunkForm(detail) {
  const typeInput = document.getElementById('detail-kb-chunk-type');
  const titleInput = document.getElementById('detail-kb-chunk-title');
  const questionInput = document.getElementById('detail-kb-chunk-question');
  const contentInput = document.getElementById('detail-kb-chunk-content');
  const fieldsList = document.getElementById('detail-kb-chunk-fields-list');
  const metaEl = document.getElementById('detail-kb-chunk-meta');

  if (!detail) {
    if (typeInput) typeInput.value = detailChunkModalState.selectedChunkType || inferDetailChunkType();
    if (titleInput) titleInput.value = '';
    if (questionInput) questionInput.value = '';
    if (contentInput) contentInput.value = '';
    if (fieldsList) fieldsList.innerHTML = '';
    if (metaEl) metaEl.textContent = detailChunkModalState.isCreating ? `新增模式  |  类型：${typeInput?.value || detailChunkModalState.selectedChunkType || 'text'}` : '';
    syncDetailChunkTypeUI();
    syncDetailChunkFieldTip();
    return;
  }

  if (typeInput) typeInput.value = String(detail.chunk_type || inferDetailChunkType());
  if (titleInput) titleInput.value = String(detail.chunk_title || '');
  if (questionInput) questionInput.value = normalizeChunkQuestion(detail);
  if (contentInput) {
    contentInput.value = String(detail.content || '');
    autoResizeTextarea(contentInput);
  }
  if (fieldsList) {
    fieldsList.innerHTML = '';
    normalizeChunkFields(detail.fields ?? detail.table_chunk_fields).forEach(field => {
      appendDetailChunkFieldRow(field);
    });
    syncDetailChunkFieldTip();
  }
  if (metaEl) {
    metaEl.textContent = [
      detail.sheet_name ? `Sheet：${detail.sheet_name}` : '',
      detail.chunk_type ? `类型：${detail.chunk_type}` : '',
      detail.chunk_status ? `状态：${detail.chunk_status}` : ''
    ].filter(Boolean).join('  |  ');
  }
  syncDetailChunkTypeUI();
}

function appendDetailChunkFieldRow(field = { field_name: '', field_value: '' }) {
  const fieldsList = document.getElementById('detail-kb-chunk-fields-list');
  if (!fieldsList) return;

  const row = document.createElement('div');
  row.className = 'kb-chunk-field-row';
  row.innerHTML = `
    <input class="form-input kb-chunk-field-name" data-detail-field-name placeholder="字段名" value="${escapeHtml(field.field_name)}">
    <textarea class="form-textarea kb-chunk-field-value" data-detail-field-value placeholder="字段值">${escapeHtml(field.field_value)}</textarea>
    <button type="button" class="btn-outline kb-chunk-field-remove" data-detail-field-remove>删除</button>
  `;
  fieldsList.appendChild(row);

  const valueTextarea = row.querySelector('[data-detail-field-value]');
  if (valueTextarea) autoResizeTextarea(valueTextarea);
}

function collectDetailChunkFields() {
  const fieldsList = document.getElementById('detail-kb-chunk-fields-list');
  if (!fieldsList) return [];

  return Array.from(fieldsList.querySelectorAll('.kb-chunk-field-row'))
    .map(row => ({
      field_name: String(row.querySelector('[data-detail-field-name]')?.value || '').trim(),
      field_value: String(row.querySelector('[data-detail-field-value]')?.value || '').trim()
    }))
    .filter(field => field.field_name || field.field_value);
}

function startDetailChunkCreate() {
  detailChunkModalState.isCreating = true;
  detailChunkModalState.selectedPointId = '';
  detailChunkModalState.selectedChunk = null;
  detailChunkModalState.detailLoading = false;
  detailChunkModalState.error = '';
  detailChunkModalState.selectedChunkType = inferDetailChunkType();
  renderDetailChunkModal();
}

function inferDetailChunkType() {
  const value = String(detailChunkModalState.selectedChunk?.chunk_type || detailChunkModalState.chunks[0]?.chunk_type || '').trim();
  if (value === 'structured' || value === 'faq' || value === 'text') {
    return value;
  }
  const activeLink = getCurrentDetailKnowledgeLink();
  const docType = String(activeLink?.docType || '').toLowerCase();
  if (docType === 'xlsx' || docType === 'xls' || docType === 'csv') {
    return 'structured';
  }
  return 'text';
}

function syncDetailChunkTypeUI() {
  const typeInput = document.getElementById('detail-kb-chunk-type');
  const titleInput = document.getElementById('detail-kb-chunk-title');
  const questionInput = document.getElementById('detail-kb-chunk-question');
  const contentInput = document.getElementById('detail-kb-chunk-content');
  const fieldsSection = document.getElementById('detail-kb-chunk-fields-section');
  const currentType = String(typeInput?.value || detailChunkModalState.selectedChunkType || inferDetailChunkType());

  if (typeInput) {
    typeInput.disabled = !detailChunkModalState.isCreating;
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

function buildDetailChunkPayload({ mode, docId, chunkType, title, question, content, fields }) {
  const payload = {
    chunk_type: chunkType
  };

  if (mode === 'create') {
    if (!docId) throw new Error('doc_id 不能为空');
    payload.doc_id = docId;
  }

  if (title.trim()) payload.chunk_title = title.trim();

  if (chunkType === 'structured') {
    if (!fields.length) {
      throw new Error('结构化切片至少需要填写 1 个字段');
    }
    payload.fields = fields;
    return payload;
  }

  if (chunkType === 'faq') {
    if (!question.trim()) throw new Error('FAQ 切片需要填写问题问法');
    if (!content.trim()) throw new Error('FAQ 切片需要填写切片内容');
    payload.question = question.trim();
    payload.content = content.trim();
    return payload;
  }

  if (!content.trim()) throw new Error('文本切片需要填写切片内容');
  payload.content = content.trim();
  return payload;
}

function syncDetailChunkFieldTip() {
  const tip = document.getElementById('detail-kb-chunk-fields-tip');
  const section = document.getElementById('detail-kb-chunk-fields-section');
  const fields = collectDetailChunkFields();
  if (tip) tip.style.display = fields.length === 0 ? 'block' : 'none';
  if (section) section.classList.toggle('is-empty', fields.length === 0);
}

function getChunkDisplayTitle(chunk, index) {
  const explicitTitle = String(chunk.chunk_title || '').trim();
  if (explicitTitle) return explicitTitle;
  const question = normalizeChunkQuestion(chunk);
  if (question) return question;
  if (chunk.sheet_name) return `${chunk.sheet_name} · 切片 ${index + 1}`;
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

function normalizeChunkFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.map(field => ({
    field_name: String(field?.field_name || ''),
    field_value: String(field?.field_value || '')
  }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function initQuestionsTable() {
  await loadQuestionsPage(1);
}

async function loadQuestionsPage(page) {
  const tbody = document.getElementById('questions-table-body');
  const pagination = document.getElementById('questions-pagination');
  if (!tbody) return;

  questionsPageState.currentPage = page;
  const offset = (page - 1) * questionsPageState.pageSize;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">加载中...</td></tr>';

  try {
    const response = await getTransferQuestionsFromDb({
      ...currentFilterParams,
      offset,
      limit: questionsPageState.pageSize
    });

    if (response && response.code === 0 && response.data && response.data.questions) {
      const questions = response.data.questions;
      const totalCount = response.data.all_num || questions.length;
      questionsPageState.totalCount = totalCount;

      tbody.innerHTML = '';

      if (questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">暂无数据</td></tr>';
        renderQuestionsPagination(pagination, 0, 1);
        return;
      }

      questions.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><div class="table-cell-main">${item.buyer_nick || '-'}</div></td>
          <td><div class="table-cell-sub">${item.seller_nick || '-'}</div></td>
          <td><span class="tag warning">${item.reason || '未知原因'}</span></td>
          <td><div class="table-cell-sub">${item.created_at || '-'}</div></td>
          <td><a href="#" class="link-text" data-conversation-id="${item.conversation_id}">查看对话</a></td>
        `;
        tbody.appendChild(row);
      });

      renderQuestionsPagination(pagination, totalCount, Math.ceil(totalCount / questionsPageState.pageSize));
    } else {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#EF4444;">加载失败</td></tr>';
      if (pagination) {
        pagination.innerHTML = '<span class="pagination-info">加载失败</span>';
      }
    }
  } catch (error) {
    console.error('获取问题列表失败:', error);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#EF4444;">加载失败: ${error.message}</td></tr>`;
    if (pagination) {
      pagination.innerHTML = '<span class="pagination-info">加载失败</span>';
    }
  }
}

function renderQuestionsPagination(container, totalCount, totalPages) {
  if (!container) return;

  const currentPage = questionsPageState.currentPage;
  const startItem = (currentPage - 1) * questionsPageState.pageSize + 1;
  const endItem = Math.min(currentPage * questionsPageState.pageSize, totalCount);

  let html = `<span class="pagination-info">显示 ${startItem} 至 ${endItem} 共 ${totalCount} 条</span>`;
  html += `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', function () {
      const page = parseInt(this.dataset.page, 10);
      if (page && page !== currentPage) {
        loadQuestionsPage(page);
      }
    });
  });
}

function initDateFilter() {
  const dateButtons = document.querySelectorAll('.date-btn:not(.date-custom-btn)');
  const customBtn = document.querySelector('.date-custom-btn');
  const dropdown = document.getElementById('date-picker-dropdown');
  const cancelBtn = document.getElementById('date-picker-cancel');
  const confirmBtn = document.getElementById('date-picker-confirm');
  const dateStart = document.getElementById('date-start');
  const dateEnd = document.getElementById('date-end');

  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  if (dateEnd) dateEnd.value = formatDate(today);
  if (dateStart) dateStart.value = formatDate(weekAgo);

  restoreDateFilterState(dateButtons, customBtn, dateStart, dateEnd);

  dateButtons.forEach(btn => {
    btn.addEventListener('click', async function () {
      document.querySelectorAll('.date-btn').forEach(button => button.classList.remove('active'));
      this.classList.add('active');

      if (dropdown) dropdown.classList.remove('show');
      if (customBtn) {
        customBtn.textContent = '自定义';
        customBtn.classList.remove('has-range');
      }

      const range = this.dataset.range;
      if (range === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const yesterdayStr = formatDate(yesterday);
        currentFilterParams = {
          start_time: `${yesterdayStr} 00:00:00`,
          end_time: `${yesterdayStr} 23:59:59`
        };
      } else if (range.endsWith('days')) {
        currentFilterParams = { interval: parseInt(range, 10) };
      } else {
        currentFilterParams = { interval: range };
      }

      saveFilterParams(currentFilterParams);
      await initCoverageStats(currentFilterParams);
      await loadQuestionsPage(1);
    });
  });

  if (customBtn) {
    customBtn.addEventListener('click', event => {
      event.stopPropagation();
      if (dropdown) dropdown.classList.toggle('show');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (dropdown) dropdown.classList.remove('show');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function () {
      const start = dateStart?.value;
      const end = dateEnd?.value;
      if (!start || !end) return;

      document.querySelectorAll('.date-btn').forEach(button => button.classList.remove('active'));
      if (customBtn) {
        customBtn.classList.add('active', 'has-range');
        customBtn.textContent = `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
      }

      currentFilterParams = {
        start_time: `${start} 00:00:00`,
        end_time: `${end} 23:59:59`
      };

      saveFilterParams(currentFilterParams);
      await initCoverageStats(currentFilterParams);
      await loadQuestionsPage(1);

      if (dropdown) dropdown.classList.remove('show');
    });
  }

  document.addEventListener('click', event => {
    if (dropdown && !dropdown.contains(event.target) && !customBtn?.contains(event.target)) {
      dropdown.classList.remove('show');
    }
  });
}

function restoreDateFilterState(dateButtons, customBtn, dateStart, dateEnd) {
  if (currentFilterParams?.start_time && currentFilterParams?.end_time) {
    const start = String(currentFilterParams.start_time).split(' ')[0];
    const end = String(currentFilterParams.end_time).split(' ')[0];
    if (dateStart) dateStart.value = start;
    if (dateEnd) dateEnd.value = end;

    document.querySelectorAll('.date-btn').forEach(button => button.classList.remove('active'));
    if (customBtn) {
      customBtn.classList.add('active', 'has-range');
      customBtn.textContent = `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
    }
    return;
  }

  if (typeof currentFilterParams?.interval === 'number') {
    const activeRange = `${currentFilterParams.interval}days`;
    const activeButton = Array.from(dateButtons).find(button => button.dataset.range === activeRange);
    if (activeButton) {
      document.querySelectorAll('.date-btn').forEach(button => button.classList.remove('active'));
      activeButton.classList.add('active');
    }
  }
}

function initChatModal() {
  const modal = document.getElementById('chat-modal');
  const closeBtn = document.getElementById('chat-modal-close');

  if (!modal) return;

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) {
      modal.classList.remove('show');
    }
  });

  document.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-conversation-id]');
    if (!trigger) return;

    event.preventDefault();
    const conversationId = trigger.dataset.conversationId;
    if (!conversationId) return;

    modal.classList.add('show');
    await loadConversationDetail(conversationId);
  });
}

async function loadConversationDetail(conversationId) {
  const contentDiv = document.getElementById('chat-content');
  const infoDiv = document.getElementById('chat-info');
  if (!contentDiv) return;

  contentDiv.innerHTML = '<div style="text-align:center;color:#9CA3AF;margin-top:40px;">加载中...</div>';
  if (infoDiv) {
    infoDiv.textContent = `会话 ID: ${conversationId}`;
  }

  if (conversationId.startsWith('mock-')) {
    renderChatMessages(
      [
        { sender: 'buyer', content: '用户问题：' + conversationId, created_at: '样例会话' },
        { sender: 'ai', content: '该分类当前仅有样例明细，真实会话需后端返回分类维度后接入。', created_at: '样例会话' }
      ],
      contentDiv
    );
    return;
  }

  try {
    const response = await getCustomerServiceConversationDetailFromDb(conversationId);
    if (response && response.code === 0 && response.data) {
      let messages = [];
      if (response.data.contents && Array.isArray(response.data.contents)) {
        messages = response.data.contents;
      } else if (Array.isArray(response.data)) {
        messages = response.data;
      } else if (response.data.messages && Array.isArray(response.data.messages)) {
        messages = response.data.messages;
      }

      renderChatMessages(messages, contentDiv);
    } else {
      contentDiv.innerHTML = `<div style="text-align:center;color:#EF4444;margin-top:40px;">加载失败: ${response?.message || '数据格式错误'}</div>`;
    }
  } catch (error) {
    console.error('加载对话详情失败:', error);
    contentDiv.innerHTML = `<div style="text-align:center;color:#EF4444;margin-top:40px;">请求失败: ${error.message}</div>`;
  }
}

function renderChatMessages(messages, container) {
  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:#9CA3AF;margin-top:40px;">暂无对话记录</div>';
    return;
  }

  messages.forEach(msg => {
    const content = msg.msg || msg.content || msg.message || '';
    const time = msg.gmtCreated || msg.created_at || msg.time || '';
    const from = msg.userNickFrom || msg.sender || msg.role || '';
    const type = msg.type || 'text';

    let role = 'buyer';
    const fromLower = String(from).toLowerCase();
    if (
      fromLower.includes('旗舰店') ||
      fromLower.includes('专卖店') ||
      fromLower.includes('客服') ||
      fromLower.includes('colorlomo') ||
      fromLower === 'ai' ||
      fromLower === 'seller' ||
      fromLower === 'assistant'
    ) {
      role = 'seller';
      if (fromLower === 'ai') role = 'ai';
    }

    const avatar = role === 'buyer' ? '👤' : role === 'ai' ? '🤖' : '👨‍💼';
    let displayContent = content;

    if (type === 'item_goods' || type === 'sys_goods') {
      displayContent = `<div style="font-size:13px;color:#4B5563;border-left:3px solid #E5E7EB;padding-left:8px;">
          <span style="color:#6B7280;font-weight:500;">[商品链接]</span><br/>${String(content).replace(/^发送下述商品链接:\s*/, '')}
        </div>`;
    }

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.innerHTML = `
      <div class="chat-avatar" title="${from}">${avatar}</div>
      <div>
        <div class="chat-bubble">${displayContent || '[无内容]'}</div>
        ${time ? `<div class="chat-time">${time}</div>` : ''}
      </div>
    `;
    container.appendChild(div);
  });

  setTimeout(() => {
    container.scrollTop = container.scrollHeight;
  }, 0);
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '0.00';
  }
  const normalized = number > 0 && number <= 1 ? number * 100 : number;
  return normalized.toFixed(2);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
