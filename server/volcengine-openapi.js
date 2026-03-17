import { Signer } from '@volcengine/openapi';
import FormData from 'form-data';

/**
 * Server-only helper.
 * Do not import this file from browser bundles, otherwise AK/SK will leak to the client.
 */

export function buildVolcOpenApiHeaders(
  { pathname, method, body, region, params, headers = {}, baseUrl = 'https://open.volcengineapi.com', service = 'air' },
  { accessKeyId, secretKey }
) {
  if (!accessKeyId || !secretKey) {
    throw new Error('缺少火山 OpenAPI 凭证，请检查 accessKeyId / secretKey');
  }

  const url = new URL(baseUrl);
  const normalizedHeaders = {
    Accept: 'application/json',
    Host: url.host,
    ...headers
  };

  if (!hasContentType(normalizedHeaders) && body && !Buffer.isBuffer(body) && !(body instanceof FormData)) {
    normalizedHeaders['Content-Type'] = 'application/json';
  }

  const requestObj = {
    region,
    headers: normalizedHeaders,
    method,
    body,
    pathname,
    params
  };

  const signer = new Signer(requestObj, service);
  signer.addAuthorization({
    accessKeyId,
    secretKey
  });

  return requestObj.headers;
}

export async function requestVolcOpenApi(
  { pathname, method, body, region, params, headers = {}, baseUrl = 'https://open.volcengineapi.com', service = 'air' },
  credentials
) {
  const url = new URL(pathname, baseUrl);
  if (method === 'GET' && params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }

  const signedHeaders = buildVolcOpenApiHeaders(
    { pathname, method, body, region, params, headers, baseUrl, service },
    credentials
  );

  const response = await fetch(url, {
    method,
    headers: signedHeaders,
    body: method === 'POST' ? body : undefined
  });

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

export async function requestVolcOpenApiMultipart(
  {
    pathname,
    region,
    params,
    fields = {},
    files = [],
    baseUrl = 'https://open.volcengineapi.com',
    service = 'air'
  },
  credentials
) {
  const form = new FormData();

  appendMultipartFields(form, fields);
  appendMultipartFiles(form, files);

  const formBuffer = form.getBuffer();
  const formHeaders = {
    ...form.getHeaders(),
    'Content-Length': String(formBuffer.length)
  };

  return requestVolcOpenApi(
    {
      pathname,
      method: 'POST',
      body: formBuffer,
      region,
      params,
      headers: formHeaders,
      baseUrl,
      service
    },
    credentials
  );
}

function hasContentType(headers) {
  return Object.keys(headers).some(key => key.toLowerCase() === 'content-type');
}

function appendMultipartFields(form, fields) {
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      value.forEach(item => form.append(key, String(item)));
      return;
    }

    if (typeof value === 'object') {
      form.append(key, JSON.stringify(value));
      return;
    }

    form.append(key, String(value));
  });
}

function appendMultipartFiles(form, files) {
  (files || []).forEach(file => {
    if (!file?.buffer) return;

    form.append(file.fieldname || 'files', file.buffer, {
      filename: file.originalname || 'upload.bin',
      contentType: file.mimetype || 'application/octet-stream',
      knownLength: file.size
    });
  });
}
