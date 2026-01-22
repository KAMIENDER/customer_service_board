/**
 * AI客服数据看板 - 回复内容页面逻辑
 * P1优先级：售前接待问题覆盖及调教
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import '../css/style.css';

// 注册 Chart.js 组件
Chart.register(...registerables);

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initCoverageStats();
  initCoverageChart();
  initCircularProgress();
  initSceneTable();
  initScriptTable();
  initDateFilter();
  initFilterTabs();
});

/**
 * 初始化覆盖率统计数据（每日统计）
 */
function initCoverageStats() {
  const coverage = MockData.coverageStats;
  
  // 动画计数器
  animateValue('stat-total-questions', 0, coverage.totalQuestions.value, 1500);
  animateValue('stat-answered', 0, coverage.answeredQuestions.value, 1500);
  
  // 设置覆盖率
  setTimeout(() => {
    document.getElementById('stat-coverage-rate').textContent = coverage.coverageRate.value;
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
 * 初始化覆盖率趋势图表（堆叠柱状图）
 */
function initCoverageChart() {
  const ctx = document.getElementById('coverageChart');
  if (!ctx) return;
  
  const data = MockData.coverageTrendData;
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [
        {
          label: '已回复',
          data: data.answered,
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderRadius: 4,
          barPercentage: 0.6
        },
        {
          label: '未回复',
          data: data.unanswered,
          backgroundColor: 'rgba(239, 68, 68, 0.6)',
          borderRadius: 4,
          barPercentage: 0.6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 20,
            font: {
              size: 12
            }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1F2937',
          bodyColor: '#6B7280',
          borderColor: '#E5E7EB',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 12
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false
          },
          ticks: {
            color: '#9CA3AF',
            font: { size: 11 }
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)'
          },
          ticks: {
            color: '#9CA3AF',
            font: { size: 11 },
            callback: (value) => value >= 1000 ? (value / 1000) + 'k' : value
          }
        }
      }
    }
  });
}

/**
 * 初始化圆形进度条
 */
function initCircularProgress() {
  const progressElement = document.querySelector('.circular-progress .progress');
  if (!progressElement) return;
  
  const coverage = MockData.coverageStats;
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (coverage.coverageRate.value / 100) * circumference;
  
  progressElement.style.strokeDasharray = circumference;
  progressElement.style.strokeDashoffset = circumference;
  
  setTimeout(() => {
    progressElement.style.strokeDashoffset = offset;
  }, 500);
  
  document.getElementById('coverage-rate').textContent = coverage.coverageRate.value;
}

/**
 * 初始化场景表格
 */
function initSceneTable() {
  const tbody = document.getElementById('scene-table-body');
  if (!tbody) return;
  
  const scenes = MockData.categoryList;
  const icons = ['📦', '🔄', '💇', '🎁', '🖼️'];
  const iconColors = ['blue', 'purple', 'orange', 'green', 'red'];
  
  scenes.forEach((item, index) => {
    const row = document.createElement('tr');
    
    const progressColor = item.coverageRate >= 80 ? 'green' : 
                         item.coverageRate >= 50 ? 'orange' : 'red';
    
    const statusText = item.status === 'optimized' ? '已优化' : 
                      item.status === 'warning' ? '需优化' : '待处理';
    const statusClass = item.status === 'optimized' ? 'success' : 
                       item.status === 'warning' ? 'warning' : 'danger';
    
    const issuesHtml = item.issues.length > 0 
      ? item.issues.map(issue => `<span class="tag warning">${issue}</span>`).join(' ')
      : `<span class="tag ${statusClass}">${statusText}</span>`;
    
    const actionText = item.status === 'optimized' ? '查看话术' : '编辑话术';
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
 * 初始化话术表格
 */
function initScriptTable() {
  const tbody = document.getElementById('script-table-body');
  if (!tbody) return;
  
  const scripts = MockData.pendingScripts;
  
  scripts.forEach(item => {
    const row = document.createElement('tr');
    
    row.innerHTML = `
      <td>
        <div class="table-cell-main">${item.type}</div>
      </td>
      <td>
        <div class="table-cell-sub" style="color: var(--text-primary);">"${item.example}"</div>
      </td>
      <td><span class="tag ${item.statusClass}">${item.status}</span></td>
      <td style="font-weight: 600;">${item.frequency}</td>
      <td><a href="#" class="link-text">编辑话术</a></td>
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
    });
  });
}
