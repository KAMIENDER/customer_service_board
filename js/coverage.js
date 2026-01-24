/**
 * AI客服数据看板 - 回复内容页面逻辑
 * P1优先级：售前接待问题覆盖及调教
 */

import { Chart, registerables } from 'chart.js';
import { MockData } from './mock-data.js';
import { initAuth } from './auth.js';
import { getQuestions, getConversationDetail } from './api.js';
import '../css/style.css';

// 注册 Chart.js 组件
Chart.register(...registerables);

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  initAuth();
  initCoverageStats();
  initCoverageChart();
  initCircularProgress();
  initSceneTable();
  initScriptTable();
  initQuestionsTable();
  initChatModal();
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
  const dateButtons = document.querySelectorAll('.date-btn:not(.date-custom-btn)');
  const customBtn = document.querySelector('.date-custom-btn');
  const dropdown = document.getElementById('date-picker-dropdown');
  const cancelBtn = document.getElementById('date-picker-cancel');
  const confirmBtn = document.getElementById('date-picker-confirm');
  const dateStart = document.getElementById('date-start');
  const dateEnd = document.getElementById('date-end');
  
  // 设置默认日期
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
    });
  });

  // 自定义按钮点击
  if (customBtn) {
    customBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (dropdown) dropdown.classList.toggle('show');
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
      }

      if (dropdown) dropdown.classList.remove('show');
    });
  }

  // 点击外部关闭
  document.addEventListener('click', function (e) {
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

// 分页状态
let questionsPageState = {
  currentPage: 1,
  pageSize: 20,
  totalCount: 0
};

/**
 * 初始化知识库无法回答问题列表
 */
async function initQuestionsTable() {
  await loadQuestionsPage(1);
}

/**
 * 加载指定页的问题列表
 */
async function loadQuestionsPage(page) {
  const tbody = document.getElementById('questions-table-body');
  const pagination = document.getElementById('questions-pagination');
  if (!tbody) return;

  // 更新当前页
  questionsPageState.currentPage = page;
  const offset = (page - 1) * questionsPageState.pageSize;

  // 显示加载状态
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9CA3AF;">加载中...</td></tr>';

  try {
    const response = await getQuestions({
      interval: 7,
      offset: offset,
      limit: questionsPageState.pageSize
    });

    if (response && response.code === 0 && response.data && response.data.questions) {
      const questions = response.data.questions;
      const totalCount = response.data.all_num || questions.length;
      questionsPageState.totalCount = totalCount;

      // 清空表格
      tbody.innerHTML = '';

      if (questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #9CA3AF;">暂无数据</td></tr>';
        renderQuestionsPagination(pagination, 0, 1);
        return;
      }

      // 渲染表格行
      questions.forEach(item => {
        const row = document.createElement('tr');
        const createdAt = item.created_at || '-';

        row.innerHTML = `
          <td>
            <div class="table-cell-main">${item.buyer_nick || '-'}</div>
          </td>
          <td>
            <div class="table-cell-sub">${item.seller_nick || '-'}</div>
          </td>
          <td>
            <span class="tag warning">${item.reason || '未知原因'}</span>
          </td>
          <td>
            <div class="table-cell-sub">${createdAt}</div>
          </td>
          <td>
            <a href="#" class="link-text" data-conversation-id="${item.conversation_id}">查看对话</a>
          </td>
        `;

        tbody.appendChild(row);
      });

      // 渲染分页
      const totalPages = Math.ceil(totalCount / questionsPageState.pageSize);
      renderQuestionsPagination(pagination, totalCount, totalPages);

    } else {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #EF4444;">加载失败</td></tr>';
      if (pagination) {
        pagination.innerHTML = '<span class="pagination-info">加载失败</span>';
      }
    }
  } catch (error) {
    console.error('获取问题列表失败:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #EF4444;">加载失败: ' + error.message + '</td></tr>';
    if (pagination) {
      pagination.innerHTML = '<span class="pagination-info">加载失败</span>';
    }
  }
}

/**
 * 渲染分页控件
 */
function renderQuestionsPagination(container, totalCount, totalPages) {
  if (!container) return;

  const currentPage = questionsPageState.currentPage;
  const startItem = (currentPage - 1) * questionsPageState.pageSize + 1;
  const endItem = Math.min(currentPage * questionsPageState.pageSize, totalCount);

  let html = `<span class="pagination-info">显示 ${startItem} 至 ${endItem} 共 ${totalCount} 条</span>`;

  // 上一页按钮
  html += `<button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

  // 页码按钮（最多显示5个）
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  // 下一页按钮
  html += `<button class="page-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

  container.innerHTML = html;

  // 绑定点击事件
  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', function () {
      const page = parseInt(this.dataset.page);
      if (page && page !== currentPage) {
        loadQuestionsPage(page);
      }
    });
  });
}

/**
 * 初始化对话详情模态框
 */
function initChatModal() {
  const modal = document.getElementById('chat-modal');
  const closeBtn = document.getElementById('chat-modal-close');
  const tableBody = document.getElementById('questions-table-body');

  if (!modal) return;

  // 关闭按钮
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('show');
    });
  }

  // 点击外部关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });

  // 表格点击委托 - 查看对话
  if (tableBody) {
    tableBody.addEventListener('click', async (e) => {
      // 查找最近的带 data-conversation-id 的元素
      const target = e.target.closest('[data-conversation-id]');
      if (target) {
        e.preventDefault();
        const conversationId = target.dataset.conversationId;

        // 显示模态框
        modal.classList.add('show');

        // 加载详情
        await loadConversationDetail(conversationId);
      }
    });
  }
}

/**
 * 加载对话详情
 */
async function loadConversationDetail(conversationId) {
  const contentDiv = document.getElementById('chat-content');
  const infoDiv = document.getElementById('chat-info');

  if (!contentDiv) return;

  // 显示加载中
  contentDiv.innerHTML = '<div style="text-align: center; color: #9CA3AF; margin-top: 40px;">加载中...</div>';
  if (infoDiv) infoDiv.textContent = `会话 ID: ${conversationId}`;

  try {
    console.log('正在请求会话详情:', conversationId);
    const response = await getConversationDetail(conversationId);
    console.log('API响应结果:', response);

    if (response && response.code === 0 && response.data) {
      let messages = [];
      // 优先适配 contents 字段 (新API格式)
      if (response.data.contents && Array.isArray(response.data.contents)) {
        messages = response.data.contents;
      } else if (Array.isArray(response.data)) {
        messages = response.data;
      } else if (response.data.messages && Array.isArray(response.data.messages)) {
        messages = response.data.messages;
      }

      console.log('解析出的消息列表:', messages);
      renderChatMessages(messages, contentDiv);
    } else {
      console.error('API返回错误或数据为空:', response);
      contentDiv.innerHTML = `<div style="text-align: center; color: #EF4444; margin-top: 40px;">加载失败: ${response?.message || '数据格式错误'}</div>`;
    }
  } catch (error) {
    console.error('加载对话详情失败:', error);
    contentDiv.innerHTML = `<div style="text-align: center; color: #EF4444; margin-top: 40px;">请求失败: ${error.message}</div>`;
  }
}

/**
 * 渲染聊天记录
 */
function renderChatMessages(messages, container) {
  try {
    container.innerHTML = '';

    if (!messages || messages.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #9CA3AF; margin-top: 40px;">暂无对话记录(列表为空)</div>';
      return;
    }

    messages.forEach(msg => {
      // 字段适配
      const content = msg.msg || msg.content || msg.message || '';
      const time = msg.gmtCreated || msg.created_at || msg.time || '';
      const from = msg.userNickFrom || msg.sender || msg.role || '';
      const type = msg.type || 'text';

      // 角色判断 (转字符串防止报错)
      let role = 'buyer';
      const fromLower = String(from).toLowerCase();

      // 如果发送者包含店铺关键词，或者是 AI/Assistant/Seller
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

      const avatar = role === 'buyer' ? '👤' : (role === 'ai' ? '🤖' : '👨‍💼');

      // 处理特殊消息类型
      let displayContent = content;
      if (type === 'item_goods' || type === 'sys_goods') {
        // 商品卡片样式优化
        let productInfo = String(content).replace(/^发送下述商品链接:\s*/, '');
        displayContent = `<div style="font-size: 13px; color: #4B5563; border-left: 3px solid #E5E7EB; padding-left: 8px;">
            <span style="color: #6B7280; font-weight: 500;">[商品链接]</span><br/>${productInfo}
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

    // 滚动到底部
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);

  } catch (renderError) {
    console.error('渲染聊天记录时出错:', renderError);
    container.innerHTML = `<div style="text-align: center; color: #EF4444; margin-top: 40px;">渲染错误: ${renderError.message}</div>`;
  }
}
