/**
 * AI客服数据看板 - 接待效率页面逻辑
 * P1优先级：辅助售前接待效率
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import { getAllNum } from './api.js';
import '../css/style.css';

// 注册 Chart.js 组件
Chart.register(...registerables);

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initAuth();
  initReceptionStats();
  initInquiryStats();
  initTrendChart();
  initDateFilter();
  initFilterTabs();
});

/**
 * 初始化接待效率统计卡片数据（每日统计）
 */
async function initReceptionStats() {
  // 显示加载状态
  showLoadingState();

  // 从API获取真实数据
  try {
    const response = await getAllNum();
    console.log('API 接待总数数据:', response);

    // 检查API返回格式 { code: 0, message: "", data: {...} }
    if (response && response.code === 0 && response.data) {
      const data = response.data;

      // AI接待人数 = all_num
      if (data.all_num !== undefined) {
        document.getElementById('stat-ai-reception').textContent = data.all_num.toLocaleString();
      }

      // 三句话无响应人数 = 3_question_num
      if (data['3_question_num'] !== undefined) {
        document.getElementById('stat-no-response').textContent = data['3_question_num'].toLocaleString();
      }

      // 转人工人数 = transfer_num
      if (data.transfer_num !== undefined) {
        document.getElementById('stat-handover').textContent = data.transfer_num.toLocaleString();
      }

      // AI转接率 = transfer_num / all_num * 100
      if (data.transfer_num !== undefined && data.all_num) {
        const handoverRate = ((data.transfer_num / data.all_num) * 100).toFixed(2);
        document.getElementById('stat-handover-rate').textContent = handoverRate;
      }

      // 无问答转人工人数 = can_not_answer_and_transfer_num
      if (data.can_not_answer_and_transfer_num !== undefined) {
        document.getElementById('stat-no-answer-handover').textContent = data.can_not_answer_and_transfer_num.toLocaleString();
      }

      // 无问答转接率 = no_answer_and_trasfer_num (API直接返回)
      if (data.no_answer_and_trasfer_num !== undefined) {
        document.getElementById('stat-no-answer-rate').textContent = data.no_answer_and_trasfer_num;
      }

      // 更新询单相关数据
      updateInquiryStats(data);
    } else {
      showErrorState('数据格式错误');
    }
  } catch (error) {
    console.warn('获取API数据失败:', error.message);
    showErrorState('加载失败');
  }

  // 移除加载状态
  hideLoadingState();
}

/**
 * 显示加载状态
 */
function showLoadingState() {
  const statIds = [
    'stat-ai-reception', 'stat-no-response', 'stat-handover',
    'stat-handover-rate', 'stat-no-answer-handover', 'stat-no-answer-rate',
    'stat-inquiry-count', 'stat-payment-count', 'stat-conversion'
  ];

  statIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<span class="loading-spinner"></span>';
      el.classList.add('loading');
    }
  });
}

/**
 * 隐藏加载状态
 */
function hideLoadingState() {
  const statIds = [
    'stat-ai-reception', 'stat-no-response', 'stat-handover',
    'stat-handover-rate', 'stat-no-answer-handover', 'stat-no-answer-rate',
    'stat-inquiry-count', 'stat-payment-count', 'stat-conversion'
  ];
  
  statIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('loading');
    }
  });
}

/**
 * 显示错误状态
 */
function showErrorState(msg) {
  const statIds = [
    'stat-ai-reception', 'stat-no-response', 'stat-handover',
    'stat-handover-rate', 'stat-no-answer-handover', 'stat-no-answer-rate',
    'stat-inquiry-count', 'stat-payment-count', 'stat-conversion'
  ];

  statIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '--';
    }
  });
}

/**
 * 根据API数据更新询单统计
 */
function updateInquiryStats(data) {
  // AI询单人数 = no_trade_num
  if (data.no_trade_num !== undefined) {
    document.getElementById('stat-inquiry-count').textContent = data.no_trade_num.toLocaleString();
  }

  // 询单支付人数 = no_trade_and_success
  if (data.no_trade_and_success !== undefined) {
    document.getElementById('stat-payment-count').textContent = data.no_trade_and_success.toLocaleString();
  }

  // 询单支付转化率 = no_trade_and_success / no_trade_num * 100
  if (data.no_trade_and_success !== undefined && data.no_trade_num) {
    const conversionRate = ((data.no_trade_and_success / data.no_trade_num) * 100).toFixed(2);
    document.getElementById('stat-conversion').textContent = conversionRate;
  }
}

/**
 * 初始化询单统计数据（API数据已由initReceptionStats处理）
 */
function initInquiryStats() {
// 询单数据由initReceptionStats中的updateInquiryStats统一处理
}

/**
 * 数字动画效果
 */
function animateValue(elementId, start, end, duration) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  const range = end - start;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用 easeOutQuart 缓动函数
    const easeProgress = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(start + range * easeProgress);
    
    element.textContent = current.toLocaleString();
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

/**
 * 初始化接待趋势图表
 */
function initTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  
  const data = MockData.trendData;
  
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: 'AI接待',
          data: data.aiReception,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#3B82F6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 6
        },
        {
          label: '转人工',
          data: data.humanHandover,
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#8B5CF6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1F2937',
          bodyColor: '#6B7280',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': ' + context.parsed.y.toLocaleString() + ' 人';
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              size: 12
            }
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              size: 12
            },
            callback: function(value) {
              if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'k';
              }
              return value;
            }
          }
        }
      }
    }
  });
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
  
  // 设置默认日期（今天和7天前）
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  if (dateEnd) dateEnd.value = formatDate(today);
  if (dateStart) dateStart.value = formatDate(weekAgo);

  // 普通日期按钮点击
  dateButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      if (dropdown) dropdown.classList.remove('show');
      console.log('日期筛选:', this.dataset.range);
    });
  });

  // 自定义按钮点击 - 显示/隐藏下拉框
  if (customBtn) {
    customBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown) {
        dropdown.classList.toggle('show');
      }
    });
  }

  // 取消按钮
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      if (dropdown) dropdown.classList.remove('show');
    });
  }

  // 确定按钮
  if (confirmBtn) {
    confirmBtn.addEventListener('click', function () {
      const start = dateStart?.value;
      const end = dateEnd?.value;

      if (start && end) {
        document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
        if (customBtn) {
          customBtn.classList.add('active', 'has-range');
          customBtn.textContent = `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
        }
        console.log('自定义日期范围:', start, '-', end);
      }

      if (dropdown) dropdown.classList.remove('show');
    });
  }

  // 点击外部关闭下拉框
  document.addEventListener('click', function (e) {
    if (dropdown && !dropdown.contains(e.target) && !customBtn?.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化显示日期为 MM/DD
 */
function formatDisplayDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

/**
 * 初始化筛选标签
 */
function initFilterTabs() {
  const filterTabs = document.querySelectorAll('.filter-tab');
  
  filterTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      filterTabs.forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      console.log('筛选:', this.textContent);
    });
  });
}
