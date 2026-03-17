/**
 * AI客服数据看板 - 回复内容页面逻辑
 * 按“综合问题数 / 通用问法 / 商品问法 / 未回复问题明细”展示
 */

import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import {
  getAllNumCached,
  getConversationDetail,
  getQuestions,
  loadFilterParams,
  saveFilterParams
} from './api.js';
import '../css/style.css';

let currentFilterParams = { interval: 7 };
const savedFilterParams = loadFilterParams();
if (savedFilterParams) {
  currentFilterParams = savedFilterParams;
}

let coverageBoardState = {
  totalQuestions: MockData.coverageStats.totalQuestions.value,
  answeredQuestions: MockData.coverageStats.answeredQuestions.value
};

const coverageCategoryExpandState = {
  general: new Set(),
  product: new Set()
};

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
  initChatModal();
  initDateFilter();
});

async function initCoverageStats(params = currentFilterParams) {
  showCoverageLoadingState();

  try {
    const response = await getAllNumCached(params);

    if (response && response.code === 0 && response.data) {
      const data = response.data;
      const totalQuestions =
        data.all_question_num !== undefined ? data.all_question_num : data.question_num;
      const answeredQuestions = data.answer_question_num;

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
    } else {
      showCoverageErrorState();
    }
  } catch (error) {
    console.warn('获取覆盖率统计失败:', error?.message || error);
    showCoverageErrorState();
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

  setTableLoading('coverage-summary-body', 4);
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
  const boardData = buildUnansweredCoverageData(
    coverageBoardState.totalQuestions,
    coverageBoardState.answeredQuestions
  );

  renderCoverageSummaryRows(boardData.summaryRows);
  renderCoverageCategoryRows('general-questions-body', boardData.generalRows);
  renderCoverageCategoryRows('product-questions-body', boardData.productRows);
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
    openUnansweredDetailModal({
      detailKey: trigger.dataset.detailKey,
      problemType: trigger.dataset.detailType || '未回复问题',
      parentLabel: trigger.dataset.detailParent || '--',
      subLabel: trigger.dataset.detailSub || '--',
      unansweredCount: Number(trigger.dataset.detailCount || 0)
    });
  });

  const uploadBtn = document.getElementById('detail-upload-doc-btn');
  const confirmBtn = document.getElementById('detail-confirm-doc-btn');
  const testBtn = document.getElementById('detail-mock-test-btn');

  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      window.alert('知识文档上传入口待接入。当前先完成展示样式和分类结构。');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      window.alert('知识文档确认流程待接入。');
    });
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      window.alert('模拟测试流程待接入。');
    });
  }
}

function openUnansweredDetailModal({ detailKey, problemType, parentLabel, subLabel, unansweredCount }) {
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

  const detailItems = MockData.unansweredDetailBoard.detailSamples[detailKey]
    || buildGenericDetailItems({ parentLabel, subLabel, unansweredCount, detailKey });

  title.textContent = `${parentLabel} / ${subLabel} 未回复问题明细`;
  subtitle.textContent = `当前展示该分类下的未回复问题摘要，可继续查看会话内容确认具体问题。`;
  typeEl.textContent = problemType;
  parentEl.textContent = parentLabel;
  subEl.textContent = subLabel;
  typeCountEl.textContent = `未回复 ${unansweredCount}`;
  parentCountEl.textContent = `未回复 ${unansweredCount}`;
  subCountEl.textContent = `未回复 ${unansweredCount}`;

  if (detailItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">暂无明细数据</td></tr>';
  } else {
    tbody.innerHTML = detailItems.map(item => `
      <tr>
        <td>${item.buyerNick}</td>
        <td>
          <div class="table-cell-main unanswered-question-cell">${item.question}</div>
          <div class="table-cell-sub">${item.issue}</div>
        </td>
        <td><span class="tag warning">否</span></td>
        <td>${item.createdAt}</td>
        <td><a href="#" class="link-text" data-conversation-id="${item.conversationId}">查看具体内容</a></td>
      </tr>
    `).join('');
  }

  modal.classList.add('show');
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
    const response = await getQuestions({
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
    const response = await getConversationDetail(conversationId);
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
  return Number(value).toFixed(2);
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
