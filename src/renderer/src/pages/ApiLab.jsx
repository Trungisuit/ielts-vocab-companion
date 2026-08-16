import React, { useEffect, useState } from 'react';

/**
 * API Lab — thuc hanh REST/Swagger bang tu vung (banking analogy).
 * Goi truc tiep local API (fetch), khong qua IPC.
 */
export default function ApiLab() {
  const [info, setInfo] = useState(null);
  const [word, setWord] = useState('Competencies');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null); // { status, body, ms, method, path }

  useEffect(() => {
    window.api.getApiLabInfo().then(setInfo).catch(() => {});
    const t = setInterval(() => {
      window.api.getApiLabInfo().then(setInfo).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const base = info?.baseUrl || 'http://127.0.0.1:3847';

  const call = async (method, path, body) => {
    setBusy(true);
    const t0 = Date.now();
    try {
      const res = await fetch(base + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      setLast({
        status: res.status,
        statusText: res.statusText,
        body: parsed,
        ms: Date.now() - t0,
        method,
        path
      });
    } catch (err) {
      setLast({
        status: 0,
        statusText: 'NETWORK_ERROR',
        body: { message: String(err.message || err), hint: 'Mở app và đợi API Lab start (port 3847)' },
        ms: Date.now() - t0,
        method,
        path
      });
    } finally {
      setBusy(false);
    }
  };

  const statusCls =
    !last ? '' :
    last.status >= 200 && last.status < 300 ? 'ok' :
    last.status === 409 ? 'warn' :
    last.status >= 400 || last.status === 0 ? 'err' : '';

  return (
    <div className="apilab-wrap">
      <h1>API Lab</h1>
      <p className="sub">
        Thực hành REST như banking API — tạo từ vựng bằng <code>POST</code>, server tự enrich flashcard.
      </p>

      <div className="apilab-status panel">
        <div>
          <b>Local API:</b>{' '}
          {info?.running ? (
            <span className="ok-text">● Running · {info.baseUrl}</span>
          ) : (
            <span className="no-text">● Starting…</span>
          )}
        </div>
        <div className="apilab-actions">
          <button className="btn" disabled={!info?.docsUrl} onClick={() => window.api.openApiDocs()}>
            Mở Swagger UI
          </button>
          <button className="btn" disabled={!info?.running} onClick={() => call('GET', '/health')}>
            GET /health
          </button>
        </div>
      </div>

      <div className="apilab-lesson panel">
        <h3>Banking analogy</h3>
        <ul>
          <li><code>POST /api/v1/vocab</code> ≈ mở hồ sơ / tạo resource → hệ thống <b>enrich</b> dữ liệu</li>
          <li><code>GET</code> ≈ tra cứu tài khoản / giao dịch (+ filter)</li>
          <li><code>PATCH</code> ≈ cập nhật KYC một phần</li>
          <li><code>409 Conflict</code> ≈ resource đã tồn tại (trùng hồ sơ)</li>
          <li><code>POST …/review</code> ≈ ghi một giao dịch / sự kiện lên resource</li>
        </ul>
      </div>

      <div className="apilab-try panel">
        <h3>Try it — POST enrich</h3>
        <p className="sub">Chỉ gửi từ; server trả POS, IPA, VN, CEFR, example, ảnh…</p>
        <div className="apilab-row">
          <input
            className="type-input"
            style={{ margin: 0, maxWidth: 320 }}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Word, e.g. Competencies"
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) call('POST', '/api/v1/vocab', { word }); }}
          />
          <button
            className="btn primary"
            disabled={busy || !word.trim()}
            onClick={() => call('POST', '/api/v1/vocab', { word: word.trim() })}
          >
            {busy ? 'Đang enrich…' : 'POST /api/v1/vocab'}
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => call('GET', `/api/v1/vocab?q=${encodeURIComponent(word.trim())}&limit=5`)}
          >
            GET search
          </button>
        </div>

        {last && (
          <div className={'apilab-response ' + statusCls}>
            <div className="apilab-response-head">
              <span>{last.method} {last.path}</span>
              <span>
                <b>{last.status || '—'}</b> {last.statusText} · {last.ms}ms
              </span>
            </div>
            <pre>{typeof last.body === 'string' ? last.body : JSON.stringify(last.body, null, 2)}</pre>
            {last.body?.card && (
              <div className="apilab-card-preview">
                <div className="word-big" style={{ fontSize: 22 }}>{last.body.card.word}</div>
                <div>
                  <span className="pos-tag">{last.body.card.pos}</span>{' '}
                  <span className="ipa">{last.body.card.ipa}</span>{' '}
                  <span className="chip">{last.body.card.cefr}</span>
                  <span className="chip">{last.body.card.topic}</span>
                </div>
                <div className="vn-big" style={{ fontSize: 18 }}>{last.body.card.vn}</div>
                <div className="def-text">{last.body.card.def}</div>
                {last.body.card.example && (
                  <div className="example-box">
                    <div className="en">{last.body.card.example}</div>
                    {last.body.card.example_vn && <div className="vi">{last.body.card.example_vn}</div>}
                  </div>
                )}
              </div>
            )}
            {last.body?.banking_analogy && (
              <p className="sub" style={{ marginTop: 10 }}>💡 {last.body.banking_analogy}</p>
            )}
          </div>
        )}
      </div>

      <div className="apilab-endpoints panel">
        <h3>Endpoints</h3>
        <table className="apilab-table">
          <tbody>
            <tr><td><code>GET /health</code></td><td>Health check</td></tr>
            <tr><td><code>GET /docs</code></td><td>Swagger UI</td></tr>
            <tr><td><code>POST /api/v1/vocab</code></td><td>Tạo + enrich từ</td></tr>
            <tr><td><code>GET /api/v1/vocab</code></td><td>List / search</td></tr>
            <tr><td><code>GET /api/v1/vocab/{'{id}'}</code></td><td>Chi tiết</td></tr>
            <tr><td><code>PATCH /api/v1/vocab/{'{id}'}</code></td><td>Sửa một phần</td></tr>
            <tr><td><code>DELETE /api/v1/vocab/{'{id}'}</code></td><td>Xóa</td></tr>
            <tr><td><code>POST /api/v1/vocab/{'{id}'}/review</code></td><td>SRS rate 1–4</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
