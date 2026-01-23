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
 */
export async function getAllNum() {
  return request('/rate/all_num', {
    method: 'POST'
  });
}

/**
 * 导出 API 服务
 */
export const apiService = {
  getAllNum
};
