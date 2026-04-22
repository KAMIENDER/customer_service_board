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
  mysqlDatabase: process.env.MYSQL_DATABASE || '',
  knowledgeBacktestWebhookUrl: process.env.KNOWLEDGE_BACKTEST_WEBHOOK_URL || 'http://14.22.86.32:5678/webhook/test_knowledge_base'
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

app.post('/api/customer-service/transfer-summary', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});

  const [conversationRows] = await pool.execute(
    `SELECT COUNT(*) AS total
    FROM taobao_customer_service_list
    WHERE company_id = ? AND startTime BETWEEN ? AND ?`,
    [companyId, startTime, endTime]
  );

  const [transferRows] = await pool.execute(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN COALESCE(reason, '') = '知识库无法回答' THEN 1 ELSE 0 END) AS no_answer_total
    FROM taobao_transfer
    WHERE company_id = ? AND created_at BETWEEN ? AND ?`,
    [companyId, startTime, endTime]
  );

  const [reasonRows] = await pool.execute(
    `SELECT
      COALESCE(NULLIF(reason, ''), '未标注原因') AS reason,
      COUNT(*) AS total
    FROM taobao_transfer
    WHERE company_id = ? AND created_at BETWEEN ? AND ?
    GROUP BY COALESCE(NULLIF(reason, ''), '未标注原因')
    ORDER BY total DESC
    LIMIT 50`,
    [companyId, startTime, endTime]
  );

  const allNum = Number(conversationRows?.[0]?.total || 0);
  const transferNum = Number(transferRows?.[0]?.total || 0);
  const noAnswerTransferNum = Number(transferRows?.[0]?.no_answer_total || 0);

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      all_num: allNum,
      transfer_num: transferNum,
      can_not_answer_and_transfer_num: noAnswerTransferNum,
      reasons: Array.isArray(reasonRows) ? reasonRows.map(item => ({
        reason: item.reason,
        transfer_num: Number(item.total || 0),
        share: transferNum > 0 ? Number(item.total || 0) / transferNum : 0
      })) : []
    }
  });
}));

app.post('/api/customer-service/coverage-summary', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});

  const [rows] = await pool.execute(
    `SELECT
      COUNT(*) AS total_question_num,
      SUM(CASE WHEN transfer_id IS NULL THEN 1 ELSE 0 END) AS answered_question_num
    FROM taobao_customer_service_conversation_analysis_result
    WHERE company_id = ?
      AND COALESCE(transfer_created_at, created_at) BETWEEN ? AND ?`,
    [companyId, startTime, endTime]
  );

  const summary = Array.isArray(rows) && rows[0] ? rows[0] : {};
  const totalQuestionNum = Number(summary.total_question_num || 0);
  const answeredQuestionNum = Number(summary.answered_question_num || 0);

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      start_time: startTime,
      end_time: endTime,
      total_question_num: totalQuestionNum,
      answered_question_num: answeredQuestionNum,
      coverage_rate: totalQuestionNum > 0 ? answeredQuestionNum / totalQuestionNum : 0
    }
  });
}));

app.post('/api/customer-service/coverage-breakdown', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});

  const [dictionaryRows] = await pool.execute(
    `SELECT
      scene_level1_code,
      scene_level1_name,
      scene_level2_code,
      scene_level2_name,
      scene_level3_code,
      scene_level3_name,
      sort_order
    FROM taobao_customer_service_scene_dictionary
    WHERE company_id = ?
      AND scene_category = 'conversation_analysis'
      AND leaf_level = 3
      AND is_enabled = 1
    ORDER BY scene_level1_name ASC, scene_level2_name ASC, sort_order ASC, scene_level3_name ASC`,
    [companyId]
  );

  const [statRows] = await pool.execute(
    `SELECT
      scene_level1_code,
      scene_level2_code,
      scene_level3_code,
      COUNT(*) AS total_question_num,
      SUM(CASE WHEN transfer_id IS NULL THEN 1 ELSE 0 END) AS answered_question_num
    FROM taobao_customer_service_conversation_analysis_result
    WHERE company_id = ?
      AND COALESCE(transfer_created_at, created_at) BETWEEN ? AND ?
      AND scene_level1_code IS NOT NULL
      AND scene_level2_code IS NOT NULL
      AND scene_level3_code IS NOT NULL
    GROUP BY scene_level1_code, scene_level2_code, scene_level3_code`,
    [companyId, startTime, endTime]
  );

  const statMap = new Map(
    (Array.isArray(statRows) ? statRows : []).map(item => [
      [
        item.scene_level1_code || '',
        item.scene_level2_code || '',
        item.scene_level3_code || ''
      ].join('||'),
      item
    ])
  );

  const leafRows = (Array.isArray(dictionaryRows) ? dictionaryRows : []).map(item => {
    const key = [
      item.scene_level1_code || '',
      item.scene_level2_code || '',
      item.scene_level3_code || ''
    ].join('||');
    const stat = statMap.get(key);
    const consultCount = Number(stat?.total_question_num || 0);
    const answeredCount = Number(stat?.answered_question_num || 0);

    return {
      key,
      level1Code: item.scene_level1_code || '',
      level1Name: item.scene_level1_name || '',
      labelCode: item.scene_level2_code || '',
      label: item.scene_level2_name || '未分类',
      subLabelCode: item.scene_level3_code || '',
      subLabel: item.scene_level3_name || '未分类',
      consultCount,
      robotReplyCount: answeredCount,
      replyRate: consultCount > 0 ? answeredCount / consultCount : 0,
      unansweredCount: Math.max(consultCount - answeredCount, 0)
    };
  });

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      start_time: startTime,
      end_time: endTime,
      general_rows: leafRows.filter(item => item.level1Code === 'general_questions'),
      product_rows: leafRows.filter(item => item.level1Code === 'product_questions')
    }
  });
}));

app.post('/api/customer-service/category-detail', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});
  const level1Code = String(req.body?.scene_level1_code || '').trim();
  const level2Code = String(req.body?.scene_level2_code || '').trim();
  const level3Code = String(req.body?.scene_level3_code || '').trim();
  const limit = Math.min(Math.max(Number(req.body?.limit || 100), 1), 200);

  const whereSql = [
    'a.company_id = ?',
    'COALESCE(a.transfer_created_at, a.created_at) BETWEEN ? AND ?',
    'a.transfer_id IS NOT NULL'
  ];
  const whereParams = [companyId, startTime, endTime];

  if (level1Code) {
    whereSql.push('a.scene_level1_code = ?');
    whereParams.push(level1Code);
  }

  if (level2Code) {
    whereSql.push('a.scene_level2_code = ?');
    whereParams.push(level2Code);
  }

  if (level3Code) {
    whereSql.push('a.scene_level3_code = ?');
    whereParams.push(level3Code);
  }

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
    FROM taobao_customer_service_conversation_analysis_result a
    WHERE ${whereSql.join(' AND ')}`,
    whereParams
  );

  const [rows] = await pool.execute(
    `SELECT
      a.conversation_id,
      COALESCE(NULLIF(a.buyer_nick, ''), NULLIF(l.buyerNick, ''), '-') AS buyer_nick,
      COALESCE(NULLIF(a.seller_nick, ''), NULLIF(l.psnNickName, ''), NULLIF(l.sellerNick, ''), '-') AS seller_nick,
      COALESCE(NULLIF(d.msg, ''), NULLIF(a.raw_reason, ''), '未提供问题内容') AS question,
      COALESCE(NULLIF(a.raw_reason, ''), CONCAT(COALESCE(a.scene_level2_name, '--'), ' / ', COALESCE(a.scene_level3_name, '--'))) AS issue,
      DATE_FORMAT(COALESCE(d.gmtCreated, a.transfer_created_at, a.created_at), '%Y-%m-%d %H:%i:%s') AS created_at
    FROM taobao_customer_service_conversation_analysis_result a
    LEFT JOIN taobao_customer_service_detail d
      ON d.id = a.msg_table_id
    LEFT JOIN taobao_customer_service_list l
      ON l.company_id = a.company_id
      AND l.tmp_conversation_id = a.conversation_id
    WHERE ${whereSql.join(' AND ')}
    ORDER BY COALESCE(a.transfer_created_at, a.created_at) DESC, a.id DESC
    LIMIT ${limit}`,
    whereParams
  );

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      all_num: Number(countRows?.[0]?.total || 0),
      questions: Array.isArray(rows) ? rows : []
    }
  });
}));

app.post('/api/customer-service/coverage-backtest', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const conversationIds = Array.isArray(req.body?.conversation_ids)
    ? req.body.conversation_ids.map(item => String(item || '').trim()).filter(Boolean)
    : [];

  if (!conversationIds.length) {
    throw createHttpError(400, 'conversation_ids 不能为空');
  }

  const uniqueConversationIds = Array.from(new Set(conversationIds)).slice(0, 100);
  const results = await mapWithConcurrency(uniqueConversationIds, 3, async conversationId => {
    const payload = {
      tmp_conversation_id: conversationId,
      company_id: companyId
    };

    try {
      const data = await postJsonWithTimeout(config.knowledgeBacktestWebhookUrl, payload, 60000);
      const resultData = data?.data || {};
      const bestReply = String(resultData?.best_reply || '').trim();
      const firstCandidateReply = String(resultData?.candidate?.[0]?.reply || '').trim();
      const action = String(resultData?.action || '').trim();
      const reply = bestReply || firstCandidateReply;
      const hit = Boolean(reply) && reply !== '转人工' && action !== '转人工';

      return {
        conversation_id: conversationId,
        success: true,
        code: Number(data?.code ?? 0),
        message: String(data?.msg || ''),
        hit,
        action,
        reason: String(resultData?.reason || ''),
        reply,
        best_reply: bestReply,
        summary: resultData?.summary ?? null,
        raw: data
      };
    } catch (error) {
      return {
        conversation_id: conversationId,
        success: false,
        code: -1,
        message: error?.message || '回测失败',
        hit: false,
        action: '',
        reason: '',
        reply: '',
        best_reply: '',
        summary: null
      };
    }
  });

  const total = results.length;
  const hit = results.filter(item => item.hit).length;

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      total,
      hit,
      coverage_rate: total > 0 ? hit / total : 0,
      results
    }
  });
}));

app.post('/api/customer-service/dashboard-metrics', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});
  const transferConversationSql = `
    SELECT DISTINCT company_id, conversation_id
    FROM taobao_transfer
    WHERE company_id = ? AND created_at BETWEEN ? AND ?
  `;

  const [overviewRows] = await pool.execute(
    `SELECT
      COUNT(*) AS total_reception_count,
      SUM(CASE WHEN tx.conversation_id IS NULL THEN 1 ELSE 0 END) AS auto_reception_count,
      SUM(CASE WHEN tx.conversation_id IS NOT NULL THEN 1 ELSE 0 END) AS assist_reception_count
    FROM taobao_customer_service_list l
    LEFT JOIN (${transferConversationSql}) tx
      ON tx.company_id = l.company_id
      AND tx.conversation_id = l.tmp_conversation_id
    WHERE l.company_id = ? AND l.startTime BETWEEN ? AND ?`,
    [companyId, startTime, endTime, companyId, startTime, endTime]
  );

  const [autoRows] = await pool.execute(
    `SELECT
      CASE WHEN COALESCE(l.coversation_num, 0) <= 3 THEN 'short' ELSE 'long' END AS convo_type,
      COUNT(*) AS reception_count,
      SUM(CASE WHEN COALESCE(l.before_buy, 0) > 0 OR COALESCE(l.after_buy, 0) > 0 THEN 1 ELSE 0 END) AS inquiry_count,
      SUM(CASE WHEN COALESCE(l.after_buy, 0) > COALESCE(l.before_buy, 0) THEN 1 ELSE 0 END) AS payment_count
    FROM taobao_customer_service_list l
    LEFT JOIN (${transferConversationSql}) tx
      ON tx.company_id = l.company_id
      AND tx.conversation_id = l.tmp_conversation_id
    WHERE l.company_id = ? AND l.startTime BETWEEN ? AND ? AND tx.conversation_id IS NULL
    GROUP BY convo_type`,
    [companyId, startTime, endTime, companyId, startTime, endTime]
  );

  const [assistRows] = await pool.execute(
    `SELECT
      COUNT(*) AS reception_count,
      SUM(CASE WHEN COALESCE(l.before_buy, 0) > 0 OR COALESCE(l.after_buy, 0) > 0 THEN 1 ELSE 0 END) AS inquiry_count,
      SUM(CASE WHEN COALESCE(l.after_buy, 0) > COALESCE(l.before_buy, 0) THEN 1 ELSE 0 END) AS payment_count
    FROM taobao_customer_service_list l
    INNER JOIN (${transferConversationSql}) tx
      ON tx.company_id = l.company_id
      AND tx.conversation_id = l.tmp_conversation_id
    WHERE l.company_id = ? AND l.startTime BETWEEN ? AND ?`,
    [companyId, startTime, endTime, companyId, startTime, endTime]
  );

  const autoMetricsMap = new Map(
    Array.isArray(autoRows)
      ? autoRows.map(item => [String(item.convo_type), {
        reception_count: Number(item.reception_count || 0),
        inquiry_count: Number(item.inquiry_count || 0),
        payment_count: Number(item.payment_count || 0)
      }])
      : []
  );

  const assistMetrics = Array.isArray(assistRows) && assistRows[0]
    ? {
      reception_count: Number(assistRows[0].reception_count || 0),
      inquiry_count: Number(assistRows[0].inquiry_count || 0),
      payment_count: Number(assistRows[0].payment_count || 0)
    }
    : {
      reception_count: 0,
      inquiry_count: 0,
      payment_count: 0
    };

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      total_reception_count: Number(overviewRows?.[0]?.total_reception_count || 0),
      auto_reception_count: Number(overviewRows?.[0]?.auto_reception_count || 0),
      assist_reception_count: Number(overviewRows?.[0]?.assist_reception_count || 0),
      auto_short: autoMetricsMap.get('short') || {
        reception_count: 0,
        inquiry_count: 0,
        payment_count: 0
      },
      auto_long: autoMetricsMap.get('long') || {
        reception_count: 0,
        inquiry_count: 0,
        payment_count: 0
      },
      assist: assistMetrics
    }
  });
}));

app.post('/api/customer-service/token-cost', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const startTimeUnix = Number(req.body?.start_time_unix_time || 0);
  const endTimeUnix = Number(req.body?.end_time_unix_time || 0);

  if (!Number.isFinite(startTimeUnix) || !Number.isFinite(endTimeUnix) || startTimeUnix <= 0 || endTimeUnix <= 0) {
    throw createHttpError(400, 'start_time_unix_time 和 end_time_unix_time 不能为空');
  }

  const [rows] = await pool.execute(
    `SELECT
      MAX(unix_timestamp) AS unix_timestamp,
      SUM(token_cost) AS token_cost
    FROM newapi_token_cost
    WHERE company_id = ? AND unix_timestamp BETWEEN ? AND ?
    GROUP BY DATE(FROM_UNIXTIME(unix_timestamp / 1000))
    ORDER BY unix_timestamp ASC`,
    [companyId, startTimeUnix, endTimeUnix]
  );

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      records: Array.isArray(rows)
        ? rows.map(item => ({
          unix_timestamp: Number(item.unix_timestamp || 0),
          token_cost: Number(item.token_cost || 0)
        }))
        : []
    }
  });
}));

app.post('/api/customer-service/questions', asyncHandler(async (req, res) => {
  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const { startTime, endTime } = resolveCustomerServiceDateRange(req.body || {});
  const offset = Math.max(Number(req.body?.offset || 0), 0);
  const limit = Math.min(Math.max(Number(req.body?.limit || 20), 1), 100);
  const reason = String(req.body?.reason || '').trim();

  const whereSql = [
    't.company_id = ?',
    't.created_at BETWEEN ? AND ?'
  ];
  const whereParams = [companyId, startTime, endTime];

  if (reason) {
    whereSql.push('COALESCE(t.reason, \'\') = ?');
    whereParams.push(reason);
  }

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total
    FROM taobao_transfer t
    WHERE ${whereSql.join(' AND ')}`,
    whereParams
  );

  const [rows] = await pool.execute(
    `SELECT
      t.conversation_id,
      COALESCE(l.buyerNick, t.buyer_nick, '-') AS buyer_nick,
      COALESCE(l.psnNickName, l.sellerNick, t.seller_nick, '-') AS seller_nick,
      COALESCE(NULLIF(t.reason, ''), '未标注原因') AS reason,
      DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM taobao_transfer t
    LEFT JOIN taobao_customer_service_list l
      ON l.company_id = t.company_id
      AND l.tmp_conversation_id = t.conversation_id
    WHERE ${whereSql.join(' AND ')}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ${limit} OFFSET ${offset}`,
    whereParams
  );

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      all_num: Number(countRows?.[0]?.total || 0),
      questions: Array.isArray(rows) ? rows : []
    }
  });
}));

app.post('/api/customer-service/detail', asyncHandler(async (req, res) => {
  const conversationId = String(req.body?.conversation_id || '').trim();
  if (!conversationId) {
    throw createHttpError(400, 'conversation_id 不能为空');
  }

  const pool = getDbPool();
  const companyId = await resolveCustomerServiceCompanyId(pool, String(req.body?.company_id || '').trim());
  const [rows] = await pool.execute(
    `SELECT
      buyerNick,
      sellerNick,
      psnNickName,
      userNickFrom,
      userNickTo,
      type,
      msg,
      DATE_FORMAT(gmtCreated, '%Y-%m-%d %H:%i:%s') AS gmtCreated
    FROM taobao_customer_service_detail
    WHERE company_id = ? AND tmp_conversation_id = ?
    ORDER BY gmtCreated ASC, id ASC`,
    [companyId, conversationId]
  );

  const contents = Array.isArray(rows) ? rows.map(item => ({
    ...item,
    sender: inferCustomerServiceMessageSender(item)
  })) : [];

  res.json({
    code: 0,
    data: {
      company_id: companyId,
      conversation_id: conversationId,
      contents
    }
  });
}));

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

app.post('/api/chunks/add', asyncHandler(async (req, res) => {
  const collectionName = String(req.body?.collection_name || '').trim();
  const resourceId = String(req.body?.resource_id || '').trim();
  const inputProject = String(req.body?.project || '').trim();
  const docId = String(req.body?.doc_id || '').trim();
  const chunkType = String(req.body?.chunk_type || '').trim();
  const region = String(req.body?.region || config.region);

  if (!docId) {
    throw createHttpError(400, 'doc_id 不能为空');
  }

  if (!chunkType) {
    throw createHttpError(400, 'chunk_type 不能为空');
  }

  const target = resolveKnowledgeBaseTarget({
    collectionName,
    resourceId,
    project: inputProject
  });

  const payload = {
    doc_id: docId,
    chunk_type: chunkType
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
      pathname: '/api/knowledge/point/add',
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

async function resolveCustomerServiceCompanyId(pool, requestedCompanyId) {
  const companyId = String(requestedCompanyId || '').trim();
  if (companyId) {
    return companyId;
  }

  const [listRows] = await pool.execute(
    `SELECT company_id
    FROM taobao_customer_service_list
    WHERE company_id IS NOT NULL AND company_id <> ''
    GROUP BY company_id
    ORDER BY MAX(startTime) DESC
    LIMIT 1`
  );

  if (Array.isArray(listRows) && listRows[0]?.company_id) {
    return String(listRows[0].company_id);
  }

  const [transferRows] = await pool.execute(
    `SELECT company_id
    FROM taobao_transfer
    WHERE company_id IS NOT NULL AND company_id <> ''
    GROUP BY company_id
    ORDER BY MAX(created_at) DESC
    LIMIT 1`
  );

  if (Array.isArray(transferRows) && transferRows[0]?.company_id) {
    return String(transferRows[0].company_id);
  }

  throw createHttpError(404, '未找到可用的 company_id');
}

function resolveCustomerServiceDateRange(params = {}) {
  const startTime = String(params.start_time || '').trim();
  const endTime = String(params.end_time || '').trim();

  if (startTime && endTime) {
    return { startTime, endTime };
  }

  const intervalRaw = params.interval;
  const intervalText = String(intervalRaw || '').trim().toLowerCase();
  const now = new Date();

  if (intervalText === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const date = formatShanghaiDate(yesterday);
    return {
      startTime: `${date} 00:00:00`,
      endTime: `${date} 23:59:59`
    };
  }

  if (intervalText === 'today') {
    const date = formatShanghaiDate(now);
    return {
      startTime: `${date} 00:00:00`,
      endTime: `${date} 23:59:59`
    };
  }

  let days = 7;
  if (typeof intervalRaw === 'number' && Number.isFinite(intervalRaw)) {
    days = Math.max(Math.floor(intervalRaw), 1);
  } else if (/^\d+$/.test(intervalText)) {
    days = Math.max(parseInt(intervalText, 10), 1);
  } else if (/^\d+days$/.test(intervalText)) {
    days = Math.max(parseInt(intervalText, 10), 1);
  }

  const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return {
    startTime: `${formatShanghaiDate(startDate)} 00:00:00`,
    endTime: `${formatShanghaiDate(now)} 23:59:59`
  };
}

function inferCustomerServiceMessageSender(item = {}) {
  const type = String(item.type || '').trim().toLowerCase();
  if (type === 'image_analyze') {
    return 'ai';
  }

  const from = String(item.userNickFrom || '').trim();
  const fromLower = from.toLowerCase();
  const to = String(item.userNickTo || '').trim();
  const toLower = to.toLowerCase();
  const buyerNick = String(item.buyerNick || '').trim();
  const sellerNick = String(item.sellerNick || '').trim();
  const accountNick = String(item.accountNick || '').trim();
  const psnNickName = String(item.psnNickName || '').trim();

  if (from && buyerNick && from === buyerNick) {
    return 'buyer';
  }

  if (to && accountNick && to === accountNick) {
    return 'buyer';
  }

  if (from && (from === sellerNick || from === psnNickName || from === accountNick)) {
    return 'seller';
  }

  if (buyerNick && fromLower === buyerNick.toLowerCase()) {
    return 'buyer';
  }

  if (accountNick && toLower === accountNick.toLowerCase()) {
    return 'buyer';
  }

  if (
    fromLower === 'ai' ||
    fromLower === 'assistant' ||
    fromLower.includes('robot') ||
    fromLower.includes('智能')
  ) {
    return 'ai';
  }

  if (
    fromLower.includes('旗舰店') ||
    fromLower.includes('专卖店') ||
    fromLower.includes('客服') ||
    fromLower.includes('shop') ||
    fromLower.includes('seller')
  ) {
    return 'seller';
  }

  return 'buyer';
}

function isMeaningfulCustomerQuestionMessage(item = {}) {
  const message = normalizeCustomerServiceMessage(item.msg);

  if (!message) {
    return false;
  }

  if (
    message.startsWith('用户进入聊天对话框') ||
    message.startsWith('当前用户来自') ||
    message.startsWith('发送下述商品链接') ||
    message.startsWith('用户上传的图片分析结果')
  ) {
    return false;
  }

  if (
    message.startsWith('http://') ||
    message.startsWith('https://')
  ) {
    return false;
  }

  return true;
}

function isMeaningfulReplyMessage(item = {}) {
  const message = normalizeCustomerServiceMessage(item.msg);
  return Boolean(message);
}

function normalizeCustomerServiceMessage(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}


function formatShanghaiDate(date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date).reduce((result, item) => {
    if (item.type !== 'literal') {
      result[item.type] = item.value;
    }
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
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

async function postJsonWithTimeout(url, payload, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      throw new Error(typeof data === 'string' ? data : data?.msg || `HTTP ${response.status}`);
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const limit = Math.max(Number(concurrency || 1), 1);
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
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
