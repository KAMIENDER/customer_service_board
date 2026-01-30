/**
 * API 服务模块
 * 处理与后端接口的通信
 */

import { supabase } from './supabase.js';

// API 基础地址
const API_BASE_URL = 'http://14.22.86.32:5678/webhook/api';

const FILTER_PARAMS_STORAGE_KEY = 'csb:filterParams';
const ALL_NUM_CACHE_STORAGE_KEY = 'csb:allNumCache';
// 缓存生命周期：同一浏览器 Tab（sessionStorage），默认不做时间过期
const ALL_NUM_CACHE_DEFAULT_TTL_MS = Number.POSITIVE_INFINITY;

function stableStringify(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  const sortedKeys = Object.keys(value).sort();
  const sorted = {};
  for (const key of sortedKeys) {
    sorted[key] = value[key];
  }
  return JSON.stringify(sorted);
}

function safeSessionStorageGetItem(key) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionStorageSetItem(key, value) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function saveFilterParams(params) {
  if (!params || typeof params !== 'object') return;
  safeSessionStorageSetItem(FILTER_PARAMS_STORAGE_KEY, JSON.stringify(params));
}

export function loadFilterParams() {
  const raw = safeSessionStorageGetItem(FILTER_PARAMS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readAllNumCache(params, ttlMs) {
  const raw = safeSessionStorageGetItem(ALL_NUM_CACHE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > ttlMs) return null;
    if (parsed.paramsKey !== stableStringify(params)) return null;
    if (!parsed.response || typeof parsed.response !== 'object') return null;
    return parsed.response;
  } catch {
    return null;
  }
}

function writeAllNumCache(params, response) {
  safeSessionStorageSetItem(
    ALL_NUM_CACHE_STORAGE_KEY,
    JSON.stringify({
      ts: Date.now(),
      paramsKey: stableStringify(params),
      response
    })
  );
}

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
 * 获取 Token 消耗统计
 * @param {Object} params - 查询参数
 * @param {number} params.start_time_unix_time - 开始时间戳 (ms)
 * @param {number} params.end_time_unix_time - 结束时间戳 (ms)
 */
export async function getTokenCost(params = {}) {
  return request('/token/cost', {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * 获取接待总数统计（带 sessionStorage 缓存）
 * - 同一 Tab 内从“接待效率”跳到“回复内容”时，可避免重复请求
 */
export async function getAllNumCached(params = {}, options = {}) {
  const ttlMs = options.ttlMs ?? ALL_NUM_CACHE_DEFAULT_TTL_MS;
  const cached = readAllNumCache(params, ttlMs);
  if (cached) return cached;

  const response = await getAllNum(params);
  if (response && response.code === 0) {
    writeAllNumCache(params, response);
  }
  return response;
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
  getQuestions,
  getConversationDetail,
  getTokenCost
};
