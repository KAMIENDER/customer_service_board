/**
 * API 服务模块
 * 处理与后端接口的通信
 */

import { supabase } from './supabase.js';

// API 基础地址
const API_BASE_URL = 'http://14.22.86.32:5678/webhook/api';

/**
 * 获取当前用户的 JWT Token
 */
async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * 通用请求方法
 */
async function request(endpoint, options = {}) {
  const token = await getAuthToken();
  
  console.log('API 请求:', {
    url: `${API_BASE_URL}${endpoint}`,
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 20)}...` : 'null'
  });
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // 添加 JWT Token
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('Authorization header 已添加');
  } else {
    console.warn('警告: 用户未登录，没有 JWT token');
  }
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

/**
 * 获取接待总数统计
 * @param {Object} params - 查询参数
 * @param {string} params.interval - 时间间隔：'today', '7days', '30days' 等
 * @param {string} params.start_time - 开始时间，格式：YYYY-MM-DD HH:mm:ss
 * @param {string} params.end_time - 结束时间，格式：YYYY-MM-DD HH:mm:ss
 */
export async function getAllNum(params = {}) {
  return request('/rate/all_num', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 获取问题列表
 * @param {Object} params - 查询参数
 * @param {number} params.interval - 时间间隔（天数）
 * @param {string} params.start_time - 开始时间
 * @param {string} params.end_time - 结束时间
 * @param {number} params.offset - 分页偏移量（从0开始）
 * @param {number} params.limit - 每页数量
 */
export async function getQuestions(params = {}) {
  return request('/rate/questions', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 获取对话详情
 * @param {string} conversationId - 会话ID
 */
export async function getConversationDetail(conversationId) {
  return request('/detail', {
    method: 'POST',
    body: JSON.stringify({ conversation_id: conversationId })
  });
}

/**
 * 导出 API 服务
 */
export const apiService = {
  getAllNum,
  getQuestions,
  getConversationDetail
};
