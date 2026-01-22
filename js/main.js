/**
 * AI客服数据看板 - 接待效率页面逻辑
 * P1优先级：辅助售前接待效率
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import '../css/style.css';

// 注册 Chart.js 组件
Chart.register(...registerables);

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initReceptionStats();
  initInquiryStats();
  initTrendChart();
  initDateFilter();
  initFilterTabs();
});

/**
 * 初始化接待效率统计卡片数据（每日统计）
 */
function initReceptionStats() {
  const stats = MockData.receptionStats;
  
  // 动画计数器 - 每日统计指标
  animateValue('stat-ai-reception', 0, stats.aiReceptionTotal.value, 1500);
  animateValue('stat-no-response', 0, stats.noResponseCount.value, 1200);
  animateValue('stat-handover', 0, stats.handoverToHuman.value, 1300);
  animateValue('stat-no-answer-handover', 0, stats.noAnswerHandover.value, 1400);
  
  // 设置百分比值
  setTimeout(() => {
    document.getElementById('stat-handover-rate').textContent = stats.handoverRate.value;
    document.getElementById('stat-no-answer-rate').textContent = stats.noAnswerHandoverRate.value;
  }, 500);
}

/**
 * 初始化询单统计数据（三日内统计）
 */
function initInquiryStats() {
  const stats = MockData.inquiryStats;

  // 动画计数器 - 询单指标
  animateValue('stat-inquiry-count', 0, stats.inquiryCount.value, 1500);
  animateValue('stat-payment-count', 0, stats.paymentCount.value, 1400);

  // 设置转化率
  setTimeout(() => {
    document.getElementById('stat-conversion').textContent = stats.conversionRate.value;
  }, 500);
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
  const dateButtons = document.querySelectorAll('.date-btn');
  
  dateButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      dateButtons.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      console.log('日期筛选:', this.textContent);
    });
  });
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
