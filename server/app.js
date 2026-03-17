import path from 'node:path';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import {
  buildVolcOpenApiHeaders,
  requestVolcOpenApi,
  requestVolcOpenApiMultipart
} from './volcengine-openapi.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const uploadDir = path.join(rootDir, '.uploads', 'knowledge-files');

const config = {
  port: Number(process.env.PORT || 38888),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  region: process.env.VOLC_REGION || 'cn-beijing',
  service: process.env.VOLC_OPENAPI_SERVICE || 'air',
  baseUrl: process.env.VOLC_OPENAPI_BASE_URL || 'https://open.volcengineapi.com',
  knowledgeBaseUrl: process.env.VOLC_KNOWLEDGE_BASE_URL || 'https://api-knowledgebase.mlp.cn-beijing.volces.com',
  accessKeyId: process.env.VOLC_ACCESS_KEY_ID || process.env.VOLC_ACCESSKEY || '',
  secretKey: process.env.VOLC_SECRET_KEY || process.env.VOLC_SECRETKEY || '',
  defaultKnowledgeBaseResourceId: process.env.VOLC_DEFAULT_KB_RESOURCE_ID || '',
  defaultKnowledgeBaseCollectionName: process.env.VOLC_DEFAULT_KB_COLLECTION_NAME || '',
  defaultKnowledgeBaseProject: process.env.VOLC_DEFAULT_KB_PROJECT || 'default',
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL || ''),
  enableSignDebug: process.env.ENABLE_VOLC_SIGN_DEBUG === '1',
  uploadFileMaxSize: Number(process.env.UPLOAD_FILE_MAX_SIZE || 20 * 1024 * 1024),
  uploadFileMaxCount: Number(process.env.UPLOAD_FILE_MAX_COUNT || 10)
};

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploadFileMaxSize,
    files: config.uploadFileMaxCount
  }
});

app.disable('x-powered-by');
app.use(corsMiddleware(config.corsOrigin));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'customer-service-board-proxy',
    credentialsConfigured: Boolean(config.accessKeyId && config.secretKey),
    defaults: {
      region: config.region,
      service: config.service,
      baseUrl: config.baseUrl,
      knowledgeBaseUrl: config.knowledgeBaseUrl
    }
  });
});

app.post('/api/knowledge-base/collections', asyncHandler(async (req, res) => {
  const project = String(req.body?.project || '').trim();
  const brief = req.body?.brief === undefined ? false : Boolean(req.body.brief);
  const region = String(req.body?.region || config.region);
  const payload = { brief };

  if (project) {
    payload.project = project;
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/collection/list',
      method: 'POST',
      region,
      service: 'air',
      baseUrl: config.knowledgeBaseUrl,
      body: JSON.stringify(payload)
    },
    getCredentials()
  );

  res.json({ ok: true, data });
}));

app.post('/api/knowledge-base/collection-info', asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const project = String(req.body?.project || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const region = String(req.body?.region || config.region);

  if (!name && !resourceId) {
    throw createHttpError(400, 'name 和 resource_id 至少要传一个');
  }

  const payload = {};

  if (name) {
    payload.name = name;
  }

  if (project || name) {
    payload.project = project;
  }

  if (resourceId) {
    payload.resource_id = resourceId;
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/collection/info',
      method: 'POST',
      region,
      service: 'air',
      baseUrl: config.knowledgeBaseUrl,
      body: JSON.stringify(payload)
    },
    getCredentials()
  );

  res.json({ ok: true, data });
}));

app.post('/api/files/list', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const region = String(req.body?.region || config.region);

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  const payload = {};

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (req.body?.filter && typeof req.body.filter === 'object') {
    payload.filter = req.body.filter;
  }

  if (req.body?.offset !== undefined) {
    payload.offset = Number(req.body.offset);
  }

  if (req.body?.limit !== undefined) {
    payload.limit = Number(req.body.limit);
  }

  if (Array.isArray(req.body?.doc_type)) {
    payload.doc_type = req.body.doc_type;
  }

  if (req.body?.return_token_usage !== undefined) {
    payload.return_token_usage = Boolean(req.body.return_token_usage);
  }

  if (req.body?.pipeline_name !== undefined) {
    payload.pipeline_name = String(req.body.pipeline_name || '');
  }

  if (req.body?.detailed !== undefined) {
    payload.detailed = Boolean(req.body.detailed);
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/doc/list',
      method: 'POST',
      region,
      service: 'air',
      baseUrl: config.knowledgeBaseUrl,
      body: JSON.stringify(payload)
    },
    getCredentials()
  );

  res.json({ ok: true, data });
}));

app.post('/api/files/info', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const docId = String(req.body?.doc_id || '').trim();
  const region = String(req.body?.region || config.region);

  if (!docId) {
    throw createHttpError(400, 'doc_id 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  const payload = {
    doc_id: docId
  };

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (req.body?.return_token_usage !== undefined) {
    payload.return_token_usage = Boolean(req.body.return_token_usage);
  }

  if (req.body?.pipeline_name !== undefined) {
    payload.pipeline_name = String(req.body.pipeline_name || '');
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/doc/info',
      method: 'POST',
      region,
      service: 'air',
      baseUrl: config.knowledgeBaseUrl,
      body: JSON.stringify(payload)
    },
    getCredentials()
  );

  res.json({ ok: true, data });
}));

app.post('/api/files/delete', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const docId = String(req.body?.doc_id || '').trim();
  const pipelineName = String(req.body?.pipeline_name || '').trim();
  const region = String(req.body?.region || config.region);

  if (!docId) {
    throw createHttpError(400, 'doc_id 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  let uploadUrl = '';
  try {
    const infoPayload = {
      doc_id: docId
    };

    if (target.collectionName) {
      infoPayload.collection_name = target.collectionName;
      infoPayload.project = target.project;
    }

    if (target.resourceId) {
      infoPayload.resource_id = target.resourceId;
    }

    if (pipelineName) {
      infoPayload.pipeline_name = pipelineName;
    }

    const infoData = await requestVolcOpenApi(
      {
        pathname: '/api/knowledge/doc/info',
        method: 'POST',
        region,
        service: 'air',
        baseUrl: config.knowledgeBaseUrl,
        body: JSON.stringify(infoPayload)
      },
      getCredentials()
    );

    uploadUrl = String(infoData?.data?.url || '');
  } catch {
    uploadUrl = '';
  }

  const payload = {
    doc_id: docId
  };

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (pipelineName) {
    payload.pipeline_name = pipelineName;
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/doc/delete',
      method: 'POST',
      region,
      service: 'air',
      baseUrl: config.knowledgeBaseUrl,
      body: JSON.stringify(payload)
    },
    getCredentials()
  );

  await cleanupUploadedPublicFile(uploadUrl);

  res.json({ ok: true, data });
}));

app.post('/api/files/upload', upload.array('files'), asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    throw createHttpError(400, '请先上传文件');
  }

  const publicBaseUrl = resolvePublicBaseUrl(req);
  const target = resolveKnowledgeBaseTarget({});

  await mkdir(uploadDir, { recursive: true });

  const results = [];
  for (const file of files) {
    const originalName = normalizeIncomingFilename(file.originalname);
    const storedName = buildStoredFilename(originalName);
    const storedPath = path.join(uploadDir, storedName);
    await writeFile(storedPath, file.buffer);

    const publicUrl = `${publicBaseUrl}/api/public-files/${encodeURIComponent(storedName)}`;
    const docId = buildUploadDocId(originalName);
    const docType = inferUploadDocType(originalName);

    const data = await requestVolcOpenApi(
      {
        pathname: '/api/knowledge/doc/add',
        method: 'POST',
        region: config.region,
        service: 'air',
        baseUrl: config.knowledgeBaseUrl,
        body: JSON.stringify({
          resource_id: target.resourceId,
          add_type: 'url',
          doc_name: originalName,
          doc_id: docId,
          doc_type: docType,
          url: publicUrl
        })
      },
      getCredentials()
    );

    results.push({
      doc_name: originalName,
      doc_id: docId,
      stored_name: storedName,
      data
    });
  }

  res.json({
    ok: true,
    success_count: results.length,
    data: {
      success_count: results.length,
      items: results
    }
  });
}));

app.get('/api/public-files/:storedName', asyncHandler(async (req, res) => {
  const storedName = sanitizeStoredName(req.params.storedName);
  if (!storedName) {
    throw createHttpError(400, '文件名非法');
  }

  const filePath = path.join(uploadDir, storedName);
  res.sendFile(filePath, { dotfiles: 'allow' });
}));

app.post('/api/volc/request', asyncHandler(async (req, res) => {
  const payload = normalizeJsonRequest(req.body);
  const credentials = getCredentials();

  const data = await requestVolcOpenApi(
    {
      pathname: payload.pathname,
      method: payload.method,
      body: payload.body,
      region: payload.region,
      params: payload.params,
      headers: payload.headers,
      baseUrl: payload.baseUrl,
      service: payload.service
    },
    credentials
  );

  res.json({ ok: true, data });
}));

app.post('/api/volc/request-multipart', upload.any(), asyncHandler(async (req, res) => {
  const credentials = getCredentials();
  const payload = normalizeMultipartRequest(req.body);

  const data = await requestVolcOpenApiMultipart(
    {
      pathname: payload.pathname,
      region: payload.region,
      params: payload.params,
      fields: payload.fields,
      files: req.files || [],
      baseUrl: payload.baseUrl,
      service: payload.service
    },
    credentials
  );

  res.json({ ok: true, data });
}));

app.post('/api/volc/signature', asyncHandler(async (req, res) => {
  if (!config.enableSignDebug) {
    res.status(404).json({ ok: false, message: '签名调试接口未开启' });
    return;
  }

  const payload = normalizeJsonRequest(req.body);
  const headers = buildVolcOpenApiHeaders(
    {
      pathname: payload.pathname,
      method: payload.method,
      body: payload.body,
      region: payload.region,
      params: payload.params,
      headers: payload.headers,
      baseUrl: payload.baseUrl,
      service: payload.service
    },
    getCredentials()
  );

  res.json({
    ok: true,
    data: maskSensitiveHeaders(headers)
  });
}));

app.use('/api/*splat', (_req, res) => {
  res.status(404).json({
    ok: false,
    message: '未找到对应的 API 路由'
  });
});

if (await pathExists(distDir)) {
  app.use(express.static(distDir, { redirect: false }));
  registerPageRoutes(app, distDir);
}

app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({
    ok: false,
    message: err.message || '服务异常'
  });
});

app.listen(config.port, () => {
  console.log(`[proxy] listening on http://localhost:${config.port}`);
});

function corsMiddleware(origin) {
  return (req, res, next) => {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

function registerPageRoutes(server, outputDir) {
  const pages = [
    ['/', 'index.html'],
    ['/index.html', 'index.html'],
    ['/coverage', 'coverage/index.html'],
    ['/coverage.html', 'coverage.html'],
    ['/handover', 'handover.html'],
    ['/handover.html', 'handover.html'],
    ['/knowledge-base', 'knowledge-base.html'],
    ['/knowledge-base.html', 'knowledge-base.html']
  ];

  pages.forEach(([routePath, filename]) => {
    server.get(routePath, (_req, res) => {
      res.sendFile(path.join(outputDir, filename));
    });
  });
}

function normalizeJsonRequest(payload) {
  const method = normalizeMethod(payload?.method);
  return {
    pathname: normalizePathname(payload?.pathname),
    method,
    region: String(payload?.region || config.region),
    service: String(payload?.service || config.service),
    baseUrl: String(payload?.baseUrl || config.baseUrl),
    params: payload?.params && typeof payload.params === 'object' ? payload.params : undefined,
    headers: payload?.headers && typeof payload.headers === 'object' ? payload.headers : undefined,
    body: method === 'POST' ? serializeBody(payload?.body) : undefined
  };
}

function normalizeMultipartRequest(payload) {
  return {
    pathname: normalizePathname(payload?.pathname),
    region: String(payload?.region || config.region),
    service: String(payload?.service || config.service),
    baseUrl: String(payload?.baseUrl || config.baseUrl),
    params: parseJsonField(payload?.params),
    fields: parseJsonField(payload?.fields, {})
  };
}

function resolveKnowledgeBaseTarget({ collectionName = '', resourceId = '', project = '' }) {
  const normalizedResourceId = String(resourceId || '').trim() || config.defaultKnowledgeBaseResourceId;
  const normalizedCollectionName = String(collectionName || '').trim() || config.defaultKnowledgeBaseCollectionName;
  const normalizedProject = String(project || '').trim() || config.defaultKnowledgeBaseProject;

  if (!normalizedResourceId && !normalizedCollectionName) {
    throw createHttpError(500, '未配置默认知识库目标，请设置 VOLC_DEFAULT_KB_RESOURCE_ID 或 VOLC_DEFAULT_KB_COLLECTION_NAME');
  }

  return {
    resourceId: normalizedResourceId,
    collectionName: normalizedCollectionName,
    project: normalizedProject
  };
}

function resolvePublicBaseUrl(req) {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl;
  }

  const host = String(req.get('host') || '');
  if (!host || isLocalHost(host)) {
    throw createHttpError(400, '上传导入需要配置 PUBLIC_BASE_URL，且该地址必须可被火山知识库服务访问');
  }

  return `${req.protocol}://${host}`;
}

function isLocalHost(host) {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(host);
}

function normalizeBaseUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildStoredFilename(originalname) {
  const safeName = sanitizeFilename(originalname);
  return `${Date.now()}-${randomUUID()}-${safeName}`;
}

function buildUploadDocId(originalname) {
  void originalname;
  return `upload_${Date.now()}`;
}

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function sanitizeStoredName(name) {
  const decoded = decodeURIComponent(String(name || ''));
  if (!decoded || decoded.includes('..') || decoded.includes('/')) {
    return '';
  }
  return decoded;
}

async function cleanupUploadedPublicFile(fileUrl) {
  const storedName = resolveStoredNameFromPublicUrl(fileUrl);
  if (!storedName) {
    return;
  }

  const filePath = path.join(uploadDir, storedName);
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[cleanup] failed to remove uploaded file: ${filePath}`, error);
    }
  }
}

function resolveStoredNameFromPublicUrl(fileUrl) {
  const value = String(fileUrl || '').trim();
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    const marker = '/api/public-files/';
    const index = url.pathname.indexOf(marker);
    if (index === -1) {
      return '';
    }

    return sanitizeStoredName(url.pathname.slice(index + marker.length));
  } catch {
    return '';
  }
}

function inferUploadDocType(filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase() || '';
  return ext || 'txt';
}

function normalizeIncomingFilename(filename) {
  const value = String(filename || '');

  try {
    const repaired = Buffer.from(value, 'latin1').toString('utf8');
    if (looksLikeChineseOrReadable(repaired) && !looksMojibake(repaired)) {
      return repaired;
    }
  } catch {
    // ignore
  }

  return value;
}

function looksMojibake(value) {
  return /[ÃÂÅÆÐÑØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö]/.test(value);
}

function looksLikeChineseOrReadable(value) {
  return /[\u4e00-\u9fff]/.test(value) || /^[\w.\- ()]+$/.test(value);
}

function normalizeMethod(value) {
  const method = String(value || 'POST').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    throw createHttpError(400, `暂不支持的请求方法：${method}`);
  }
  return method;
}

function normalizePathname(value) {
  const pathname = String(value || '').trim();
  if (!pathname || !pathname.startsWith('/')) {
    throw createHttpError(400, 'pathname 必须以 / 开头');
  }
  return pathname;
}

function serializeBody(body) {
  if (body === undefined || body === null || body === '') {
    return undefined;
  }

  if (typeof body === 'string') {
    return body;
  }

  return JSON.stringify(body);
}

function parseJsonField(value, defaultValue = undefined) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw createHttpError(400, 'JSON 字段解析失败，请检查 params / fields');
  }
}

function getCredentials() {
  if (!config.accessKeyId || !config.secretKey) {
    throw createHttpError(500, '服务端未配置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_KEY');
  }

  return {
    accessKeyId: config.accessKeyId,
    secretKey: config.secretKey
  };
}

function maskSensitiveHeaders(headers) {
  const result = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (key.toLowerCase() === 'authorization') {
      result[key] = maskValue(String(value));
      return;
    }

    result[key] = value;
  });

  return result;
}

function maskValue(value) {
  if (value.length <= 20) return '***';
  return `${value.slice(0, 24)}...${value.slice(-16)}`;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
