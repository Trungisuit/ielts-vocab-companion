/**
 * Local REST API + Swagger UI — de hoc API (banking-style) qua tu vung.
 * Mac dinh: http://127.0.0.1:3847
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const db = require('./db');
const srs = require('./srs');
const enrich = require('./enrich');

const DEFAULT_PORT = 3847;
let server = null;
let listeningPort = null;

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('Invalid JSON body');
        err.status = 400;
        err.code = 'INVALID_JSON';
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function cardToApi(card) {
  if (!card) return null;
  return {
    id: card.id,
    word: card.word,
    pos: card.pos,
    ipa: card.ipa,
    cefr: card.cefr,
    vn: card.vn,
    def: card.def,
    example: card.example,
    example_vn: card.example_vn,
    collocations: card.collocations,
    synonyms: card.synonyms,
    topic: card.topic,
    function: card.function || '',
    state: card.state,
    starred: !!card.starred,
    image_url: card.image_path ? `/api/v1/vocab/${card.id}/image` : null,
    audio_url: card.audio_path ? `/api/v1/vocab/${card.id}/audio` : null
  };
}

function buildOpenApi(port) {
  const base = `http://127.0.0.1:${port}`;
  return {
    openapi: '3.0.3',
    info: {
      title: 'IELTS Vocab API Lab',
      version: '1.0.0',
      description:
        'Local REST API để vừa học từ vựng IELTS vừa thực hành API kiểu banking.\n\n' +
        '**Banking analogy:** `POST /vocab` ≈ tạo hồ sơ / mở tài khoản rồi hệ thống **enrich** dữ liệu.\n\n' +
        'Thử `POST` body `{ "word": "Competencies" }` — server trả flashcard đầy đủ (POS, IPA, VN, CEFR, example, ảnh…).'
    },
    servers: [{ url: base, description: 'Local Electron API' }],
    tags: [
      { name: 'Vocab', description: 'CRUD từ vựng — giống resource banking' },
      { name: 'Review', description: 'SRS rating — giống post transaction' },
      { name: 'Meta', description: 'Health & docs' }
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Meta'],
          summary: 'Health check',
          responses: { '200': { description: 'OK' } }
        }
      },
      '/api/v1/vocab': {
        get: {
          tags: ['Vocab'],
          summary: 'List / search vocabulary',
          description: 'Giống list transactions / accounts với filter.',
          parameters: [
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search word or Vietnamese' },
            { name: 'topic', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
          ],
          responses: { '200': { description: 'Paged list' } }
        },
        post: {
          tags: ['Vocab'],
          summary: 'Create + enrich a word (banking-style onboarding)',
          description:
            'Chỉ cần gửi `word`. Server tự điền POS, IPA, định nghĩa, nghĩa Việt, example, CEFR, ảnh…\n\n' +
            '**409** nếu từ đã tồn tại (idempotency / conflict).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['word'],
                  properties: {
                    word: { type: 'string', example: 'Competencies' },
                    topic: { type: 'string', example: 'work_business' },
                    vn: { type: 'string', description: 'Optional — override Vietnamese meaning' },
                    cefr: { type: 'string', example: 'B2' }
                  }
                },
                example: { word: 'Competencies' }
              }
            }
          },
          responses: {
            '201': { description: 'Created & enriched' },
            '400': { description: 'Validation error' },
            '409': { description: 'Word already exists' }
          }
        }
      },
      '/api/v1/vocab/{id}': {
        get: {
          tags: ['Vocab'],
          summary: 'Get one card by id',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { description: 'Card' }, '404': { description: 'Not found' } }
        },
        patch: {
          tags: ['Vocab'],
          summary: 'Partial update (như cập nhật KYC)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    word: { type: 'string' },
                    vn: { type: 'string' },
                    def: { type: 'string' },
                    pos: { type: 'string' },
                    cefr: { type: 'string' },
                    topic: { type: 'string' },
                    example: { type: 'string' },
                    example_vn: { type: 'string' }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'Updated' }, '404': { description: 'Not found' } }
        },
        delete: {
          tags: ['Vocab'],
          summary: 'Delete card',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '204': { description: 'Deleted' }, '404': { description: 'Not found' } }
        }
      },
      '/api/v1/vocab/{id}/review': {
        post: {
          tags: ['Review'],
          summary: 'Rate card (SRS) — giống post a transaction',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['rating'],
                  properties: {
                    rating: { type: 'integer', minimum: 1, maximum: 4, description: '1=Again 2=Hard 3=Good 4=Easy', example: 3 }
                  }
                }
              }
            }
          },
          responses: { '200': { description: 'SRS updated' }, '400': { description: 'Bad rating' }, '404': { description: 'Not found' } }
        }
      }
    }
  };
}

function swaggerHtml(port) {
  const specUrl = `http://127.0.0.1:${port}/openapi.json`;
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <title>IELTS Vocab API Lab — Swagger</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"/>
  <style>
    body { margin: 0; background: #0f1117; }
    .topbar { display: none; }
    .swagger-ui .info .title { color: #e8eaed; }
    .swagger-ui .info p, .swagger-ui .info li { color: #b0b6c0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
      tryItOutEnabled: true
    });
  </script>
</body>
</html>`;
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const u = new URL(req.url, `http://127.0.0.1:${listeningPort}`);
  const p = u.pathname.replace(/\/+$/, '') || '/';

  try {
    if (req.method === 'GET' && p === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        service: 'ielts-vocab-api-lab',
        port: listeningPort,
        analogy: 'Health check — giống ping gateway banking'
      });
    }

    if (req.method === 'GET' && p === '/openapi.json') {
      return sendJson(res, 200, buildOpenApi(listeningPort));
    }

    if (req.method === 'GET' && (p === '/docs' || p === '/swagger')) {
      return sendText(res, 200, swaggerHtml(listeningPort), 'text/html; charset=utf-8');
    }

    // GET list
    if (req.method === 'GET' && p === '/api/v1/vocab') {
      const q = u.searchParams.get('q') || '';
      const topic = u.searchParams.get('topic') || null;
      const limit = Math.min(Number(u.searchParams.get('limit') || 20), 100);
      const offset = Number(u.searchParams.get('offset') || 0);
      const result = db.listCards({ search: q, topic, limit, offset });
      return sendJson(res, 200, {
        total: result.total,
        limit,
        offset,
        items: result.cards.map(cardToApi),
        banking_analogy: 'GET list + filter — giống truy vấn danh sách giao dịch / tài khoản'
      });
    }

    // POST create+enrich
    if (req.method === 'POST' && p === '/api/v1/vocab') {
      const body = await readBody(req);
      try {
        const card = await enrich.enrichAndSave(body);
        return sendJson(res, 201, {
          message: 'Created and enriched',
          card: cardToApi(card),
          banking_analogy: card.banking_analogy
        });
      } catch (err) {
        if (err.status === 409) {
          return sendJson(res, 409, {
            error: err.code,
            message: err.message,
            existing: cardToApi(err.existing),
            banking_analogy: '409 Conflict — resource đã tồn tại (idempotent create / trùng hồ sơ)'
          });
        }
        throw err;
      }
    }

    const m = p.match(/^\/api\/v1\/vocab\/(\d+)(?:\/(review|image|audio))?$/);
    if (m) {
      const id = Number(m[1]);
      const sub = m[2] || null;
      const card = db.getCard(id);

      if (sub === 'image' && req.method === 'GET') {
        if (!card?.image_path || !fs.existsSync(card.image_path)) {
          return sendJson(res, 404, { error: 'NOT_FOUND', message: 'No image' });
        }
        const buf = fs.readFileSync(card.image_path);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*' });
        return res.end(buf);
      }
      if (sub === 'audio' && req.method === 'GET') {
        if (!card?.audio_path || !fs.existsSync(card.audio_path)) {
          return sendJson(res, 404, { error: 'NOT_FOUND', message: 'No audio' });
        }
        const buf = fs.readFileSync(card.audio_path);
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*' });
        return res.end(buf);
      }

      if (!card && req.method !== 'POST') {
        // review also needs card
      }
      if (!card) {
        return sendJson(res, 404, {
          error: 'NOT_FOUND',
          message: `Card ${id} not found`,
          banking_analogy: '404 — account / resource không tồn tại'
        });
      }

      if (req.method === 'GET' && !sub) {
        return sendJson(res, 200, { card: cardToApi(card) });
      }

      if (req.method === 'PATCH' && !sub) {
        const body = await readBody(req);
        const next = {
          word: body.word ?? card.word,
          pos: body.pos ?? card.pos,
          ipa: body.ipa ?? card.ipa,
          cefr: body.cefr ?? card.cefr,
          vn: body.vn ?? card.vn,
          def: body.def ?? card.def,
          example: body.example ?? card.example,
          example_vn: body.example_vn ?? card.example_vn,
          collocations: body.collocations ?? card.collocations,
          synonyms: body.synonyms ?? card.synonyms,
          topic: body.topic ?? card.topic
        };
        db.updateCard(id, next);
        return sendJson(res, 200, {
          message: 'Updated',
          card: cardToApi(db.getCard(id)),
          banking_analogy: 'PATCH — cập nhật một phần hồ sơ (KYC / profile)'
        });
      }

      if (req.method === 'DELETE' && !sub) {
        db.deleteCard(id);
        res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }

      if (req.method === 'POST' && sub === 'review') {
        const body = await readBody(req);
        const rating = Number(body.rating);
        if (![1, 2, 3, 4].includes(rating)) {
          return sendJson(res, 400, {
            error: 'VALIDATION_ERROR',
            message: 'rating must be 1, 2, 3, or 4'
          });
        }
        const result = srs.rate(id, rating);
        return sendJson(res, 200, {
          message: 'Review recorded',
          rating,
          result,
          card: cardToApi(db.getCard(id)),
          banking_analogy: 'POST review — giống ghi một giao dịch / sự kiện lên resource'
        });
      }
    }

    return sendJson(res, 404, {
      error: 'NOT_FOUND',
      message: `No route ${req.method} ${p}`,
      hint: 'Open /docs for Swagger UI'
    });
  } catch (err) {
    const status = err.status || 500;
    return sendJson(res, status, {
      error: err.code || 'INTERNAL_ERROR',
      message: err.message || String(err)
    });
  }
}

function start(port = DEFAULT_PORT) {
  if (server) return Promise.resolve(listeningPort);
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      handle(req, res).catch((err) => {
        sendJson(res, 500, { error: 'INTERNAL_ERROR', message: String(err.message || err) });
      });
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < DEFAULT_PORT + 20) {
        server = null;
        start(port + 1).then(resolve).catch(reject);
        return;
      }
      reject(err);
    });
    server.listen(port, '127.0.0.1', () => {
      listeningPort = port;
      console.log(`[API Lab] http://127.0.0.1:${port}/docs`);
      resolve(port);
    });
  });
}

function stop() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      listeningPort = null;
      resolve();
    });
  });
}

function getInfo() {
  return {
    running: !!listeningPort,
    port: listeningPort,
    baseUrl: listeningPort ? `http://127.0.0.1:${listeningPort}` : null,
    docsUrl: listeningPort ? `http://127.0.0.1:${listeningPort}/docs` : null,
    openapiUrl: listeningPort ? `http://127.0.0.1:${listeningPort}/openapi.json` : null
  };
}

module.exports = { start, stop, getInfo, DEFAULT_PORT };
