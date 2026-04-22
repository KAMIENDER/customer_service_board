/**
 * AI客服数据看板 - Excel 版接待效率首页
 * 按《数据看板需求.xlsx》中的四个类别拆分为 4 个 tab 展示
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import {
  getCustomerServiceDashboardMetricsFromDb,
  getCustomerServiceTokenCostFromDb,
  getAllNumCached,
  getTransferSummaryFromDb,
  loadFilterParams,
  saveFilterParams
} from './api.js';
import '../css/style.css';

Chart.register(...registerables);

let currentFilterParams = { interval: 7 };
let tokenCostChart = null;
const savedFilterParams = loadFilterParams();
if (savedFilterParams) {
  currentFilterParams = savedFilterParams;
}

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initDashboardTabs();
  initDateFilter();
  initActionButtons();
  refreshData();
  initTokenCostChart();
});

async function refreshData(params = currentFilterParams) {
  showLoadingState();

  let apiData = null;
  let transferSummaryData = null;
  let dashboardMetricsData = null;
  try {
    const [allNumResponse, transferSummaryResponse, dashboardMetricsResponse] = await Promise.allSettled([
      getAllNumCached(params),
      getTransferSummaryFromDb(params),
      getCustomerServiceDashboardMetricsFromDb(params)
    ]);

    if (allNumResponse.status === 'fulfilled') {
      const response = allNumResponse.value;
      if (response && response.code === 0 && response.data) {
        apiData = response.data;
      }
    }

    if (transferSummaryResponse.status === 'fulfilled') {
      const response = transferSummaryResponse.value;
      if (response && response.code === 0 && response.data) {
        transferSummaryData = response.data;
      }
    }

    if (dashboardMetricsResponse.status === 'fulfilled') {
      const response = dashboardMetricsResponse.value;
      if (response && response.code === 0 && response.data) {
        dashboardMetricsData = response.data;
      }
    }
  } catch (error) {
    console.warn('获取首页接待效率数据失败，使用默认推导数据:', error?.message || error);
  }

  const dashboardData = buildDashboardData(apiData, transferSummaryData, dashboardMetricsData);
  renderDashboard(dashboardData);
  hideLoadingState();
}

function buildDashboardData(apiData, transferSummaryData, dashboardMetricsData) {
  const defaults = MockData.dashboardWorkbookDefaults;
  const assumptions = MockData.dashboardWorkbookAssumptions;
  const realConversationCount = pickNumber(transferSummaryData?.all_num, null);
  const realTransferCount = pickNumber(transferSummaryData?.transfer_num, null);
  const realNoAnswerTransferCount = pickNumber(transferSummaryData?.can_not_answer_and_transfer_num, null);

  const aiReceptionCount = clamp(
    pickNumber(apiData?.all_num, pickNumber(realConversationCount, defaults.aiReceptionCount)),
    0
  );
  const transferCount = clamp(
    pickNumber(apiData?.transfer_num, pickNumber(realTransferCount, defaults.transferCount)),
    0,
    aiReceptionCount
  );
  const noAnswerTransferCount = clamp(
    pickNumber(
      apiData?.can_not_answer_and_transfer_num,
      pickNumber(realNoAnswerTransferCount, defaults.noAnswerTransferCount)
    ),
    0,
    transferCount
  );
  const aiCoverageRateRaw = clamp(
    pickNumber(apiData?.ai_coverage_rate, defaults.aiCoverageRate),
    0,
    1
  );

  const storeTotalReception = Math.max(
    pickNumber(dashboardMetricsData?.total_reception_count, pickNumber(realConversationCount, null)) || 0,
    aiReceptionCount,
    Math.round(aiReceptionCount / (aiCoverageRateRaw || defaults.aiCoverageRate || 1))
  );
  const autoReceptionCount = clamp(
    pickNumber(dashboardMetricsData?.auto_reception_count, aiReceptionCount - transferCount),
    0,
    storeTotalReception
  );
  const assistReceptionCount = clamp(
    pickNumber(dashboardMetricsData?.assist_reception_count, transferCount),
    0,
    storeTotalReception
  );

  const shortConversationCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_short?.reception_count,
      apiData?.['3_question_num'],
      defaults.threeSentenceConversationCount
    ),
    0,
    autoReceptionCount
  );
  const longConversationCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_long?.reception_count,
      autoReceptionCount - shortConversationCount
    ),
    0,
    autoReceptionCount
  );

  const inquiryCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_short?.inquiry_count,
      0
    ) + pickNumber(
      dashboardMetricsData?.auto_long?.inquiry_count,
      pickNumber(apiData?.no_trade_num, defaults.inquiryCount)
    ),
    0,
    autoReceptionCount
  );
  const paymentCount = clamp(
    pickNumber(dashboardMetricsData?.auto_short?.payment_count, 0) +
      pickNumber(
        dashboardMetricsData?.auto_long?.payment_count,
        pickNumber(apiData?.no_trade_and_success, defaults.paymentCount)
      ),
    0,
    inquiryCount || autoReceptionCount
  );

  const shortInquiryCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_short?.inquiry_count,
      Math.round(inquiryCount * assumptions.autoShortInquiryShare)
    ),
    0,
    shortConversationCount
  );
  const longInquiryCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_long?.inquiry_count,
      Math.max(inquiryCount - shortInquiryCount, 0)
    ),
    0,
    longConversationCount
  );

  const shortPaymentCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_short?.payment_count,
      Math.round(paymentCount * assumptions.autoShortPaymentShare)
    ),
    0,
    shortInquiryCount || shortConversationCount
  );
  const longPaymentCount = clamp(
    pickNumber(
      dashboardMetricsData?.auto_long?.payment_count,
      Math.max(paymentCount - shortPaymentCount, 0)
    ),
    0,
    longInquiryCount || longConversationCount
  );

  const shortOrderAmount = shortPaymentCount * assumptions.autoShortAverageOrderValue;
  const longOrderAmount = longPaymentCount * assumptions.autoLongAverageOrderValue;

  const assistInquiryCount = clamp(
    pickNumber(
      dashboardMetricsData?.assist?.inquiry_count,
      Math.round(assistReceptionCount * assumptions.assistInquiryRate)
    ),
    0,
    assistReceptionCount
  );
  const assistPaymentCount = clamp(
    pickNumber(
      dashboardMetricsData?.assist?.payment_count,
      Math.round(assistInquiryCount * assumptions.assistPaymentRate)
    ),
    0,
    assistInquiryCount || assistReceptionCount
  );
  const assistOrderAmount = assistPaymentCount * assumptions.assistAverageOrderValue;

  const remainingTransferCount = Math.max(transferCount - noAnswerTransferCount, 0);
  const normalFlowCount = Math.round(remainingTransferCount * assumptions.sceneDistribution.normalFlow);
  const customerDemandCount = Math.round(remainingTransferCount * assumptions.sceneDistribution.customerDemand);
  const emotionIssueCount = Math.round(remainingTransferCount * assumptions.sceneDistribution.emotionIssue);
  const afterSalesCount = Math.max(
    remainingTransferCount - normalFlowCount - customerDemandCount - emotionIssueCount,
    0
  );

  return {
    overview: {
      storeTotalReception,
      aiReceptionCount,
      aiCoverageRate: percentage(aiReceptionCount, storeTotalReception),
      autoReceptionCount,
      autoReceptionRate: percentage(autoReceptionCount, aiReceptionCount),
      assistReceptionCount,
      assistReceptionRate: percentage(assistReceptionCount, aiReceptionCount)
    },
    autoRows: [
      {
        label: '用户回话3句话以内会话',
        receptionCount: shortConversationCount,
        inquiryCount: shortInquiryCount,
        paymentCount: shortPaymentCount
      },
      {
        label: '用户回话3句话以上会话',
        receptionCount: longConversationCount,
        inquiryCount: longInquiryCount,
        paymentCount: longPaymentCount
      }
    ].map(item => ({
      ...item,
      conversionRate: percentage(item.paymentCount, item.inquiryCount)
    })),
    assist: {
      receptionCount: assistReceptionCount,
      inquiryCount: assistInquiryCount,
      paymentCount: assistPaymentCount,
      conversionRate: percentage(assistPaymentCount, assistInquiryCount)
    },
    scene: {
      totalTransferCount: transferCount,
      noAnswerTransferCount,
      items: [
        { label: '正常流程转接', count: normalFlowCount },
        { label: '客户需求转人工', count: customerDemandCount },
        { label: '无法解答问题转接', count: noAnswerTransferCount },
        { label: '情绪问题转接', count: emotionIssueCount },
        { label: '售后类问题转接', count: afterSalesCount }
      ].map(item => ({
        ...item,
        share: percentage(item.count, transferCount)
      }))
    }
  };
}

function renderDashboard(dashboardData) {
  renderOverview(dashboardData.overview);
  renderAutoEfficiencyTable(dashboardData.autoRows);
  renderAssistStats(dashboardData.assist);
  renderSceneMatrix(dashboardData.scene);
}

function renderOverview(overview) {
  setText('stat-store-total', formatNumber(overview.storeTotalReception));
  setText('stat-ai-reception', formatNumber(overview.aiReceptionCount));
  setText('stat-ai-coverage-rate', formatPercent(overview.aiCoverageRate));
  setText('stat-auto-reception', formatNumber(overview.autoReceptionCount));
  setText('stat-auto-rate', formatPercent(overview.autoReceptionRate));
  setText('stat-assist-reception', formatNumber(overview.assistReceptionCount));
  setText('stat-assist-rate', formatPercent(overview.assistReceptionRate));
}

function renderAutoEfficiencyTable(rows) {
  const tbody = document.getElementById('auto-efficiency-table-body');
  if (!tbody) return;

  tbody.innerHTML = rows.map(row => `
    <tr>
      <td>
        <div class="table-cell-main">${row.label}</div>
      </td>
      <td>${formatNumber(row.receptionCount)}</td>
      <td>${formatNumber(row.inquiryCount)}</td>
      <td>${formatNumber(row.paymentCount)}</td>
      <td>${formatPercent(row.conversionRate)}%</td>
    </tr>
  `).join('');
}

function renderAssistStats(assist) {
  setText('assist-stat-reception', formatNumber(assist.receptionCount));
  setText('assist-stat-inquiry', formatNumber(assist.inquiryCount));
  setText('assist-stat-order-count', formatNumber(assist.paymentCount));
  setText('assist-stat-conversion-rate', formatPercent(assist.conversionRate));
}

function renderSceneMatrix(scene) {
  setText('scene-total-transfer', formatNumber(scene.totalTransferCount));
  setText('scene-no-answer-transfer', formatNumber(scene.noAnswerTransferCount));

  const headerRow = document.getElementById('scene-header-row');
  const countRow = document.getElementById('scene-count-row');
  const shareRow = document.getElementById('scene-share-row');
  if (!headerRow || !countRow || !shareRow) return;

  headerRow.innerHTML = `
    <th>场景</th>
    ${scene.items.map(item => `<th>${item.label}</th>`).join('')}
  `;

  countRow.innerHTML = `
    <td class="matrix-row-label">人数</td>
    ${scene.items.map(item => `<td>${formatNumber(item.count)}</td>`).join('')}
  `;

  shareRow.innerHTML = `
    <td class="matrix-row-label">占比（统计整体）</td>
    ${scene.items.map(item => `<td>${formatPercent(item.share)}%</td>`).join('')}
  `;
}

function showLoadingState() {
  [
    'stat-store-total',
    'stat-ai-reception',
    'stat-ai-coverage-rate',
    'stat-auto-reception',
    'stat-auto-rate',
    'stat-assist-reception',
    'stat-assist-rate',
    'assist-stat-reception',
    'assist-stat-inquiry',
    'assist-stat-order-count',
    'assist-stat-conversion-rate',
    'scene-total-transfer',
    'scene-no-answer-transfer'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '--';
    el.classList.add('loading');
  });

  const autoTbody = document.getElementById('auto-efficiency-table-body');
  if (autoTbody) {
    autoTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">加载中...</td></tr>';
  }

  const headerRow = document.getElementById('scene-header-row');
  const countRow = document.getElementById('scene-count-row');
  const shareRow = document.getElementById('scene-share-row');
  if (headerRow) headerRow.innerHTML = '<th>场景</th><th>加载中...</th>';
  if (countRow) countRow.innerHTML = '<td class="matrix-row-label">人数</td><td>--</td>';
  if (shareRow) shareRow.innerHTML = '<td class="matrix-row-label">占比（统计整体）</td><td>--</td>';
}

function hideLoadingState() {
  document.querySelectorAll('.stat-value.loading, .scene-summary-card strong.loading').forEach(el => {
    el.classList.remove('loading');
  });
}

function initDashboardTabs() {
  const tabs = document.querySelectorAll('.dashboard-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-selected', String(item === tab));
      });

      panels.forEach(panel => {
        panel.classList.toggle('active', panel.dataset.tabPanel === target);
      });

      tab.classList.add('active');
    });
  });
}

function initActionButtons() {
  const refreshButton = document.getElementById('refresh-dashboard-btn');
  if (refreshButton) {
    refreshButton.addEventListener('click', async () => {
      await Promise.all([refreshData(), initTokenCostChart()]);
    });
  }

  const exportButton = document.getElementById('export-report-btn');
  if (exportButton) {
    exportButton.addEventListener('click', () => {
      window.print();
    });
  }
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
      await refreshData();
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
    confirmBtn.addEventListener('click', async () => {
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
      await refreshData();

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function pickNumber(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function clamp(value, min = 0, max = Number.POSITIVE_INFINITY) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString('zh-CN');
}

function formatPercent(value) {
  return Number(value).toFixed(2);
}

function formatCurrency(value) {
  return `¥${Math.round(value).toLocaleString('zh-CN')}`;
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

async function initTokenCostChart() {
  const ctx = document.getElementById('token-cost-chart');
  const errorEl = document.getElementById('token-chart-error');
  const totalEl = document.getElementById('total-token-cost');
  if (!ctx) return;

  if (errorEl) {
    errorEl.hidden = true;
  }
  if (totalEl) {
    totalEl.textContent = '--';
  }

  try {
    const now = new Date();
    const endTimeUnix = now.getTime();
    const startTimeUnix = endTimeUnix - (31 * 24 * 60 * 60 * 1000);

    const response = await getCustomerServiceTokenCostFromDb({
      start_time_unix_time: startTimeUnix,
      end_time_unix_time: endTimeUnix
    });

    if (!(response && response.code === 0 && response.data && Array.isArray(response.data.records))) {
      throw new Error('Token 消耗数据格式错误');
    }

    const records = [...response.data.records].sort((a, b) => a.unix_timestamp - b.unix_timestamp);
    const dailySums = records.map(item => Number(item.token_cost || 0));
    const chartData = dailySums.map((value, index) => {
      if (index === 0) {
        return value;
      }

      return value - dailySums[index - 1];
    });
    const chartLabels = records.map(item => {
      const date = new Date(item.unix_timestamp);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const totalCost = chartData.reduce((sum, value) => sum + value, 0);

    if (totalEl) {
      totalEl.textContent = Math.max(0, totalCost).toLocaleString('zh-CN');
    }

    if (tokenCostChart) {
      tokenCostChart.destroy();
    }

    tokenCostChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [{
          label: 'Token 消耗量',
          data: chartData,
          fill: true,
          borderColor: '#6366F1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#6366F1',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)'
            },
            ticks: {
              callback(value) {
                if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
                return value;
              }
            }
          },
          x: {
            grid: {
              display: false
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('初始化 Token 消耗图表失败:', error);
    if (tokenCostChart) {
      tokenCostChart.destroy();
      tokenCostChart = null;
    }
    if (errorEl) {
      errorEl.hidden = false;
    }
  }
}
