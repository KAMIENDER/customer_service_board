/**
 * AI客服数据看板 - 主页面逻辑
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import '../css/style.css';

// 注册 Chart.js 组件
Chart.register(...registerables);

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initStats();
  initTrendChart();
  initCoverageChart();
  initCategoryTable();
  initPendingIssuesTable();
  initDateFilter();
  initFilterTabs();
});

/**
 * 初始化统计卡片数据
 */
function initStats() {
  const stats = MockData.stats;
  
  // 动画计数器
  animateValue('stat-ai-reception', 0, stats.aiReceptionTotal.value, 1500);
  animateValue('stat-no-response', 0, stats.noResponseCount.value, 1200);
  animateValue('stat-handover', 0, stats.handoverToHuman.value, 1300);
  
  // 设置百分比值
  document.getElementById('stat-handover-rate').textContent = stats.handoverRate.value;
  document.getElementById('stat-conversion').textContent = stats.inquiryConversion.value;
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
 * 初始化覆盖率圆形图表
 */
function initCoverageChart() {
  const progressElement = document.querySelector('.circular-progress .progress');
  if (!progressElement) return;
  
  const coverage = MockData.coverageStats;
  const circumference = 2 * Math.PI * 70; // r = 70
  const offset = circumference - (coverage.coverageRate / 100) * circumference;
  
  progressElement.style.strokeDasharray = circumference;
  progressElement.style.strokeDashoffset = circumference;
  
  // 动画效果
  setTimeout(() => {
    progressElement.style.strokeDashoffset = offset;
  }, 500);
  
  // 更新数值
  document.getElementById('coverage-rate').textContent = coverage.coverageRate;
  animateValue('total-questions', 0, coverage.totalQuestions, 1500);
  animateValue('answered-questions', 0, coverage.answeredQuestions, 1500);
}

/**
 * 初始化问题分类表格
 */
function initCategoryTable() {
  const tbody = document.getElementById('category-table-body');
  if (!tbody) return;
  
  const categories = MockData.categoryList;
  const iconColors = ['blue', 'purple', 'orange', 'green', 'red'];
  const icons = ['📦', '🔄', '💇', '🎁', '🖼️'];
  
  categories.forEach((item, index) => {
    const row = document.createElement('tr');
    
    const statusClass = item.status === 'optimized' ? 'success' : 
                       item.status === 'warning' ? 'warning' : 'danger';
    const statusText = item.status === 'optimized' ? '已优化' : 
                      item.status === 'warning' ? '需优化' : '待处理';
    
    const progressColor = item.coverageRate >= 80 ? 'green' : 
                         item.coverageRate >= 50 ? 'orange' : 'red';
    
    const issuesHtml = item.issues.length > 0 
      ? item.issues.map(issue => `<span class="tag warning">${issue}</span>`).join(' ')
      : `<span class="tag success">${statusText}</span>`;
    
    const actionText = item.status === 'optimized' ? '详情' : 
                      item.status === 'warning' ? '优化' : '创建场景';
    const actionClass = item.status === 'optimized' ? '' : 'primary';
    
    row.innerHTML = `
      <td>
        <div style="display: flex; align-items: center;">
          <div class="category-icon ${iconColors[index % iconColors.length]}">${icons[index % icons.length]}</div>
          <div>
            <div class="table-cell-main">${item.name}</div>
            <div class="table-cell-sub">${item.category}</div>
          </div>
        </div>
      </td>
      <td>
        <div class="table-cell-main">${item.volume.toLocaleString()}</div>
        <div class="table-cell-sub">${item.volumeTrend}</div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600;">${item.coverageRate}%</span>
          <div class="mini-progress">
            <div class="fill ${progressColor}" style="width: ${item.coverageRate}%"></div>
          </div>
        </div>
      </td>
      <td>${issuesHtml}</td>
      <td>
        <button class="btn-outline ${actionClass}">${actionText}</button>
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

/**
 * 初始化待优化问题表格
 */
function initPendingIssuesTable() {
  const tbody = document.getElementById('pending-issues-body');
  if (!tbody) return;
  
  const issues = MockData.pendingIssues;
  
  issues.forEach(item => {
    const row = document.createElement('tr');
    
    const issueClass = item.issue === '低置信度' ? 'warning' : 
                      item.issue === '无法回答' ? 'danger' : 'info';
    
    row.innerHTML = `
      <td>
        <div class="table-cell-main">${item.topic}</div>
        <div class="table-cell-sub">${item.description}</div>
      </td>
      <td><span class="tag ${issueClass}">${item.issue}</span></td>
      <td style="font-weight: 600;">${item.frequency}</td>
      <td><a href="#" class="link-text">${item.action}</a></td>
    `;
    
    tbody.appendChild(row);
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
      
      // 这里可以添加实际的数据刷新逻辑
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
      
      // 这里可以添加实际的筛选逻辑
      console.log('筛选:', this.textContent);
    });
  });
}
