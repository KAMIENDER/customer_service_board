const proxyBaseUrl = normalizeProxyBaseUrl(import.meta.env.VITE_KB_PROXY_BASE_URL || inferDefaultProxyBaseUrl());

export function isKnowledgeBaseProxyEnabled() {
  return Boolean(proxyBaseUrl);
}

export async function listKnowledgeBaseFiles(payload = {}) {
  const data = await requestProxy('/files/list', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return normalizeFileListResponse(data);
}

export async function getKnowledgeBaseFileInfo(payload = {}) {
  const data = await requestProxy('/files/info', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return normalizeFileInfoResponse(data);
}

export async function uploadKnowledgeBaseFiles(files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const data = await requestProxy('/files/upload', {
    method: 'POST',
    body: formData
  });

  return normalizeUploadResponse(data);
}

export async function deleteKnowledgeBaseFile(payload = {}) {
  return await requestProxy('/files/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
}

export async function listKnowledgeBaseRecords() {
  const data = await requestProxy('/entries', { method: 'GET' });
  return normalizeRecords(data);
}

export async function createKnowledgeBaseManualEntry(payload) {
  const data = await requestProxy('/entries', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return normalizeSingleRecord(data);
}

export async function uploadKnowledgeBaseDocuments(files) {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const data = await requestProxy('/documents', {
    method: 'POST',
    body: formData
  });

  const records = normalizeRecords(data);
  return Array.isArray(records) ? records : [];
}

export async function deleteKnowledgeBaseRecord(id) {
  await requestProxy(`/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
}

function normalizeProxyBaseUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function inferDefaultProxyBaseUrl() {
  if (typeof window === 'undefined') return '';

  const { protocol, hostname, port, origin } = window.location;
  if (port === '3000') {
    return `${protocol}//${hostname}:38888/api`;
  }

  return `${origin}/api`;
}

async function requestProxy(pathname, options = {}) {
  if (!proxyBaseUrl) {
    throw new Error('知识库代理未配置，请设置 VITE_KB_PROXY_BASE_URL');
  }

  const response = await fetch(`${proxyBaseUrl}${pathname}`, options);
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = typeof data === 'string'
      ? data
      : data?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function normalizeRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.records)) return payload.records;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  return [];
}

function normalizeSingleRecord(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.record && typeof payload.record === 'object') return payload.record;
    if (payload.data?.record && typeof payload.data.record === 'object') return payload.data.record;
    return payload;
  }
  return null;
}

function normalizeFileListResponse(payload) {
  const data = payload?.data?.data || payload?.data || payload || {};
  return {
    collectionName: data.collection_name || '',
    totalNum: Number(data.total_num || 0),
    count: Number(data.count || 0),
    records: Array.isArray(data.doc_list) ? data.doc_list : []
  };
}

function normalizeFileInfoResponse(payload) {
  const data = payload?.data?.data || payload?.data || payload || {};
  return {
    record: data.doc_info || data.record || data
  };
}

function normalizeUploadResponse(payload) {
  const data = payload?.data || payload || {};
  return {
    successCount: Number(data.success_count || payload?.success_count || 0),
    items: Array.isArray(data.items) ? data.items : []
  };
}
