/**
 * AI客服数据看板 - 转人工维度页面逻辑
 */

import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import { getTransferSummaryFromDb, loadFilterParams, saveFilterParams } from './api.js';
import '../css/style.css';

let currentFilterParams = { interval: 7 };
const savedFilterParams = loadFilterParams();
if (savedFilterParams) {
  currentFilterParams = savedFilterParams;
}

document.addEventListener('DOMContentLoaded', function() {
  initAuth();
  initDateFilter();
  initHandoverBoard();
});

async function refreshData() {
  await initHandoverBoard(currentFilterParams);
}

/**
 * 初始化转人工维度看板
 * @param {Object} params
 */
async function initHandoverBoard(params = currentFilterParams) {
  showLoadingState();

  try {
    const response = await getTransferSummaryFromDb(params);
    if (response && response.code === 0 && response.data) {
      const data = response.data;
      updateSummary(data);
      renderHandoverSceneTable(MockData.handoverSceneStats || [], data.transfer_num);
    } else {
      showErrorState();
      renderHandoverSceneTable(MockData.handoverSceneStats || []);
    }
  } catch (error) {
    console.warn('获取转人工维度数据失败:', error?.message || error);
    showErrorState();
    renderHandoverSceneTable(MockData.handoverSceneStats || []);
  }

  hideLoadingState();
}

function updateSummary(data) {
  const transferNum = data.transfer_num;
  const allNum = data.all_num;
  const noAnswerTransfer = data.can_not_answer_and_transfer_num;

  setText('handover-total', transferNum !== undefined ? transferNum.toLocaleString() : '--');
  setText('handover-no-answer', noAnswerTransfer !== undefined ? noAnswerTransfer.toLocaleString() : '--');

  if (transferNum !== undefined && allNum) {
    setText('handover-rate', ((transferNum / allNum) * 100).toFixed(2));
  } else {
    setText('handover-rate', '--');
  }
}

/**
 * 渲染转人工场景表格
 * @param {Array} sceneStats
 * @param {number} totalTransferNum
 */
function renderHandoverSceneTable(sceneStats, totalTransferNum) {
  const tbody = document.getElementById('handover-scene-table-body');
  if (!tbody) return;

  const list = Array.isArray(sceneStats) ? sceneStats : [];
  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;">暂无场景数据</td></tr>';
    return;
  }

  const fallbackTotal = list.reduce((sum, item) => sum + (item.transferCount || 0), 0);
  const denominator = Number.isFinite(totalTransferNum) && totalTransferNum > 0 ? totalTransferNum : fallbackTotal;

  const statusTextMap = {
    info: '已覆盖',
    warning: '需优化',
    danger: '高优先'
  };

  tbody.innerHTML = '';
  list.forEach(item => {
    const count = Number(item.transferCount) || 0;
    const share = denominator > 0 ? (count / denominator) * 100 : 0;
    const shareText = denominator > 0 ? `${share.toFixed(2)}%` : '--';
    const progressColor = share >= 30 ? 'red' : share >= 18 ? 'orange' : 'green';
    const statusClass = item.status || 'info';
    const statusText = statusTextMap[statusClass] || '已覆盖';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="table-cell-main">${item.name || '--'}</div>
      </td>
      <td>
        <div class="table-cell-sub">${item.description || '--'}</div>
      </td>
      <td>
        <div class="table-cell-main">${count.toLocaleString()}</div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-weight:600;">${shareText}</span>
          <div class="mini-progress">
            <div class="fill ${progressColor}" style="width:${Math.min(100, share)}%"></div>
          </div>
        </div>
      </td>
      <td><span class="tag ${statusClass}">${statusText}</span></td>
    `;
    tbody.appendChild(row);
  });
}

function showLoadingState() {
  const ids = ['handover-total', 'handover-rate', 'handover-no-answer'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<span class="loading-spinner"></span>';
    el.classList.add('loading');
  });
}

function hideLoadingState() {
  const ids = ['handover-total', 'handover-rate', 'handover-no-answer'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('loading');
  });
}

function showErrorState() {
  setText('handover-total', '--');
  setText('handover-rate', '--');
  setText('handover-no-answer', '--');
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

/**
 * 初始化日期筛选器
 */
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

  dateButtons.forEach(btn => {
    btn.addEventListener('click', async function() {
      document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      if (dropdown) dropdown.classList.remove('show');

      if (customBtn) {
        customBtn.textContent = '自定义';
        customBtn.classList.remove('has-range');
      }

      const range = this.dataset.range;
      if (range === 'yesterday') {
        const y = new Date(today);
        y.setDate(today.getDate() - 1);
        const yStr = formatDate(y);
        currentFilterParams = {
          start_time: `${yStr} 00:00:00`,
          end_time: `${yStr} 23:59:59`
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
    customBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (dropdown) dropdown.classList.toggle('show');
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener('click', function() {
      if (dropdown) dropdown.classList.remove('show');
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function() {
      const start = dateStart?.value;
      const end = dateEnd?.value;
      if (start && end) {
        document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
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
      }
      if (dropdown) dropdown.classList.remove('show');
    });
  }

  document.addEventListener('click', function(e) {
    if (dropdown && !dropdown.contains(e.target) && !customBtn?.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
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
