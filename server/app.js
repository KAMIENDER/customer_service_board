import path from 'node:path';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import mysql from 'mysql2/promise';
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
  uploadFileMaxCount: Number(process.env.UPLOAD_FILE_MAX_COUNT || 10),
  mysqlHost: process.env.MYSQL_HOST || '',
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlUser: process.env.MYSQL_USER || '',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: process.env.MYSQL_DATABASE || ''
};

let dbPool = null;

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
    databaseConfigured: Boolean(config.mysqlHost && config.mysqlUser && config.mysqlDatabase),
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

app.get('/api/coverage-scene-binding', asyncHandler(async (req, res) => {
  const problemType = String(req.query?.problem_type || '').trim();
  const parentLabel = String(req.query?.parent_label || '').trim();
  const subLabel = String(req.query?.sub_label || '').trim();

  if (!problemType || !parentLabel || !subLabel) {
    throw createHttpError(400, 'problem_type、parent_label、sub_label 不能为空');
  }

  const pool = getDbPool();
  const [rows] = await pool.execute(
    `SELECT
      id,
      problem_type,
      parent_label,
      sub_label,
      resource_id,
      collection_name,
      project,
      doc_id,
      doc_name,
      doc_type,
      process_status,
      binding_source,
      remark,
      created_at,
      updated_at
    FROM taobao_customer_service_kb_scene_binding
    WHERE problem_type = ? AND parent_label = ? AND sub_label = ?
    ORDER BY updated_at DESC, id DESC
    LIMIT 1`,
    [problemType, parentLabel, subLabel]
  );

  res.json({
    ok: true,
    data: Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  });
}));

app.get('/api/coverage-scene-bindings', asyncHandler(async (req, res) => {
  const problemType = String(req.query?.problem_type || '').trim();
  const parentLabel = String(req.query?.parent_label || '').trim();
  const subLabel = String(req.query?.sub_label || '').trim();

  if (!problemType || !parentLabel || !subLabel) {
    throw createHttpError(400, 'problem_type、parent_label、sub_label 不能为空');
  }

  const pool = getDbPool();
  const [rows] = await pool.execute(
    `SELECT
      id,
      problem_type,
      parent_label,
      sub_label,
      resource_id,
      collection_name,
      project,
      doc_id,
      doc_name,
      doc_type,
      process_status,
      binding_source,
      remark,
      created_at,
      updated_at
    FROM taobao_customer_service_kb_scene_binding
    WHERE problem_type = ? AND parent_label = ? AND sub_label = ?
    ORDER BY updated_at DESC, id DESC`,
    [problemType, parentLabel, subLabel]
  );

  res.json({
    ok: true,
    data: Array.isArray(rows) ? rows : []
  });
}));

app.post('/api/coverage-scene-binding', asyncHandler(async (req, res) => {
  const problemType = String(req.body?.problem_type || '').trim();
  const parentLabel = String(req.body?.parent_label || '').trim();
  const subLabel = String(req.body?.sub_label || '').trim();
  const docId = String(req.body?.doc_id || '').trim();
  const docName = String(req.body?.doc_name || '').trim();

  if (!problemType || !parentLabel || !subLabel) {
    throw createHttpError(400, 'problem_type、parent_label、sub_label 不能为空');
  }

  if (!docId || !docName) {
    throw createHttpError(400, 'doc_id、doc_name 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName: String(req.body?.collection_name || '').trim(),
    resourceId: String(req.body?.resource_id || '').trim(),
    project: String(req.body?.project || '').trim()
  });

  const docType = String(req.body?.doc_type || '').trim() || null;
  const processStatus = req.body?.process_status === undefined || req.body?.process_status === null || req.body?.process_status === ''
    ? null
    : Number(req.body.process_status);
  const bindingSource = String(req.body?.binding_source || 'manual').trim() || 'manual';
  const remark = String(req.body?.remark || '').trim() || null;

  const pool = getDbPool();
  await pool.execute(
    `INSERT INTO taobao_customer_service_kb_scene_binding (
      problem_type,
      parent_label,
      sub_label,
      resource_id,
      collection_name,
      project,
      doc_id,
      doc_name,
      doc_type,
      process_status,
      binding_source,
      remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      resource_id = VALUES(resource_id),
      collection_name = VALUES(collection_name),
      project = VALUES(project),
      doc_id = VALUES(doc_id),
      doc_name = VALUES(doc_name),
      doc_type = VALUES(doc_type),
      process_status = VALUES(process_status),
      binding_source = VALUES(binding_source),
      remark = VALUES(remark),
      updated_at = CURRENT_TIMESTAMP`,
    [
      problemType,
      parentLabel,
      subLabel,
      target.resourceId || null,
      target.collectionName || null,
      target.project || null,
      docId,
      docName,
      docType,
      Number.isFinite(processStatus) ? processStatus : null,
      bindingSource,
      remark
    ]
  );

  const [rows] = await pool.execute(
    `SELECT
      id,
      problem_type,
      parent_label,
      sub_label,
      resource_id,
      collection_name,
      project,
      doc_id,
      doc_name,
      doc_type,
      process_status,
      binding_source,
      remark,
      created_at,
      updated_at
    FROM taobao_customer_service_kb_scene_binding
    WHERE problem_type = ? AND parent_label = ? AND sub_label = ? AND doc_id = ?
    LIMIT 1`,
    [problemType, parentLabel, subLabel, docId]
  );

  res.json({
    ok: true,
    data: Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  });
}));

app.delete('/api/coverage-scene-binding', asyncHandler(async (req, res) => {
  const problemType = String(req.body?.problem_type || '').trim();
  const parentLabel = String(req.body?.parent_label || '').trim();
  const subLabel = String(req.body?.sub_label || '').trim();
  const docId = String(req.body?.doc_id || '').trim();

  if (!problemType || !parentLabel || !subLabel || !docId) {
    throw createHttpError(400, 'problem_type、parent_label、sub_label、doc_id 不能为空');
  }

  const pool = getDbPool();
  await pool.execute(
    `DELETE FROM taobao_customer_service_kb_scene_binding
    WHERE problem_type = ? AND parent_label = ? AND sub_label = ? AND doc_id = ?`,
    [problemType, parentLabel, subLabel, docId]
  );

  res.json({ ok: true });
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

  const processStatus = Number(data?.data?.status?.process_status);
  if (processStatus === 0 || processStatus === 1) {
    await cleanupUploadedPublicFile(data?.data?.url);
  }

  res.json({ ok: true, data });
}));

app.post('/api/chunks/list', asyncHandler(async (req, res) => {
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
    doc_ids: [docId]
  };

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (req.body?.offset !== undefined) {
    payload.offset = Number(req.body.offset);
  }

  if (req.body?.limit !== undefined) {
    payload.limit = Number(req.body.limit);
  }

  if (req.body?.pipeline_name !== undefined) {
    payload.pipeline_name = String(req.body.pipeline_name || '');
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/point/list',
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

app.post('/api/chunks/info', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const pointId = String(req.body?.point_id || '').trim();
  const region = String(req.body?.region || config.region);

  if (!pointId) {
    throw createHttpError(400, 'point_id 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  const payload = {
    point_id: pointId
  };

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (req.body?.pipeline_name !== undefined) {
    payload.pipeline_name = String(req.body.pipeline_name || '');
  }

  if (req.body?.get_attachment_link !== undefined) {
    payload.get_attachment_link = Boolean(req.body.get_attachment_link);
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/point/info',
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

app.post('/api/chunks/update', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const pointId = String(req.body?.point_id || '').trim();
  const region = String(req.body?.region || config.region);

  if (!pointId) {
    throw createHttpError(400, 'point_id 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  const payload = {
    point_id: pointId
  };

  if (target.collectionName) {
    payload.collection_name = target.collectionName;
    payload.project = target.project;
  }

  if (target.resourceId) {
    payload.resource_id = target.resourceId;
  }

  if (req.body?.pipeline_name !== undefined) {
    payload.pipeline_name = String(req.body.pipeline_name || '');
  }

  if (req.body?.content !== undefined) {
    payload.content = String(req.body.content || '');
  }

  if (req.body?.chunk_title !== undefined) {
    payload.chunk_title = String(req.body.chunk_title || '');
  }

  if (req.body?.question !== undefined) {
    payload.question = String(req.body.question || '');
  }

  if (req.body?.fields !== undefined) {
    payload.fields = req.body.fields;
  }

  const data = await requestVolcOpenApi(
    {
      pathname: '/api/knowledge/point/update',
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

app.post('/api/files/download-link', asyncHandler(async (req, res) => {
  const url = await resolveKnowledgeDownloadUrl({
    docId: String(req.body?.doc_id || '').trim(),
    collectionName: String(req.body?.collection_name || '').trim(),
    resourceId: String(req.body?.resource_id || '').trim(),
    project: String(req.body?.project || '').trim(),
    pipelineName: String(req.body?.pipeline_name || '').trim(),
    region: String(req.body?.region || config.region)
  });

  res.json({
    ok: true,
    data: {
      download_url: url
    }
  });
}));

app.get('/api/files/download/:docId', asyncHandler(async (req, res) => {
  const url = await resolveKnowledgeDownloadUrl({
    docId: String(req.params.docId || '').trim(),
    collectionName: String(req.query?.collection_name || '').trim(),
    resourceId: String(req.query?.resource_id || '').trim(),
    project: String(req.query?.project || '').trim(),
    pipelineName: String(req.query?.pipeline_name || '').trim(),
    region: String(req.query?.region || config.region)
  });

  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, url);
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

async function waitForKnowledgeDownloadTask({ taskId, pipelineName = '', region = config.region }) {
  const timeoutMs = 60_000;
  const intervalMs = 2_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const payload = { task_id: taskId };
    if (pipelineName) {
      payload.pipeline_name = pipelineName;
    }

    const data = await requestVolcOpenApi(
      {
        pathname: '/api/knowledge/task/info',
        method: 'POST',
        region,
        service: 'air',
        baseUrl: config.knowledgeBaseUrl,
        body: JSON.stringify(payload)
      },
      getCredentials()
    );

    const taskInfo = data?.data || {};
    const status = String(taskInfo?.status || '').trim().toLowerCase();
    if (status === 'success') {
      return taskInfo;
    }

    if (status === 'fail') {
      throw createHttpError(502, '火山知识库生成下载文件失败');
    }

    await sleep(intervalMs);
  }

  throw createHttpError(504, '等待火山知识库生成下载文件超时');
}

async function resolveDownloadFallbackUrl({ docId, target, pipelineName = '', region = config.region }) {
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

  try {
    const infoData = await requestVolcOpenApi(
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

    const url = String(infoData?.data?.url || '').trim();
    if (!url) {
      return '';
    }

    return await isRemoteFileReachable(url) ? url : '';
  } catch {
    return '';
  }
}

async function resolveKnowledgeDownloadUrl({
  docId,
  collectionName = '',
  resourceId = '',
  project = '',
  pipelineName = '',
  region = config.region
}) {
  if (!docId) {
    throw createHttpError(400, 'doc_id 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project
  });

  const downloadPayload = {
    doc_id: docId
  };

  if (target.collectionName) {
    downloadPayload.collection_name = target.collectionName;
    downloadPayload.project = target.project;
  }

  if (target.resourceId) {
    downloadPayload.resource_id = target.resourceId;
  }

  if (pipelineName) {
    downloadPayload.pipeline_name = pipelineName;
  }

  try {
    const taskResponse = await requestVolcOpenApi(
      {
        pathname: '/api/knowledge/task/download',
        method: 'POST',
        region,
        service: 'air',
        baseUrl: config.knowledgeBaseUrl,
        body: JSON.stringify(downloadPayload)
      },
      getCredentials()
    );

    const taskId = String(taskResponse?.data?.task_id || '').trim();
    if (!taskId) {
      throw createHttpError(502, '火山知识库未返回下载任务 ID');
    }

    const taskInfo = await waitForKnowledgeDownloadTask({
      taskId,
      pipelineName,
      region
    });

    const attachmentLink = String(taskInfo?.attachment_link || '').trim();
    if (!attachmentLink) {
      throw createHttpError(502, '火山知识库未返回下载链接');
    }

    return attachmentLink;
  } catch (error) {
    const fallbackUrl = await resolveDownloadFallbackUrl({
      docId,
      target,
      pipelineName,
      region
    });

    if (fallbackUrl) {
      return fallbackUrl;
    }

    throw createHttpError(
      409,
      `当前文档暂不支持通过火山下载接口直接导出，且源文件已不可访问：${error.message || '下载失败'}`
    );
  }
}

async function isRemoteFileReachable(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual'
    });
    return response.ok || [301, 302, 303, 307, 308].includes(response.status);
  } catch {
    return false;
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

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
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

function getDbPool() {
  if (dbPool) {
    return dbPool;
  }

  if (!config.mysqlHost || !config.mysqlUser || !config.mysqlDatabase) {
    throw createHttpError(500, '服务端未配置 MYSQL_HOST / MYSQL_USER / MYSQL_DATABASE');
  }

  dbPool = mysql.createPool({
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
  });

  return dbPool;
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
