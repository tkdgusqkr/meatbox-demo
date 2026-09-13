// 미트박스 TMS 데모 서버 — 의존성 없는 Node http + SSE
// 실행: node server.js  →  http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createSim } = require('./lib/sim');
const { ACCOUNTS } = require('./lib/data');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const sim = createSim();
const clients = new Set(); // { res, acct }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// ---- 역할별 데이터 스코핑: 고객은 본인 주문만, 기사는 본인 배차만, 관리자는 전체 ----
function scoped(full, acct) {
  const base = { clock: full.clock, running: full.running, speed: full.speed, phase: full.phase };
  if (acct.role === 'admin' || acct.role === 'controller') return { role: acct.role, me: acct, ...full };

  if (acct.role === 'customer') {
    const d = Object.values(full.deliveries).find((x) => x.accountId === acct.id);
    const v = full.vehicles.find((x) => x.id === d.vehicleId);
    return {
      role: 'customer', me: acct, ...base,
      delivery: d, mfc: full.mfc,
      vehicle: { name: v.name, driver: v.driver, color: v.color, state: v.state, pos: v.pos },
      notifications: full.notifications.filter((n) => n.accountId === acct.id).slice(0, 30),
    };
  }
  if (acct.role === 'driver') {
    const v = full.vehicles.find((x) => x.id === acct.vehicleId);
    return {
      role: 'driver', me: acct, ...base,
      vehicle: { id: v.id, name: v.name, region: v.region, color: v.color, state: v.state, done: v.done, total: v.total, auto: v.auto },
      stops: v.order.map((id, i) => {
        const d = full.deliveries[id];
        return {
          deliveryId: d.id, pos: i + 1, shop: d.shop, custName: d.custName, dong: d.dong,
          boxes: d.boxes, items: d.items, status: d.status, photo: d.photo,
          current: v.state === 'STOP' && i === v.cursor,
          upcoming: i === v.cursor && v.state === 'RUN',
        };
      }),
    };
  }
  return base;
}

function pushAll() {
  const full = sim.snapshot();
  for (const c of clients) {
    try {
      c.res.write(`data: ${JSON.stringify(scoped(full, c.acct))}\n\n`);
    } catch { clients.delete(c); }
  }
}

setInterval(() => { sim.tick(); pushAll(); }, 1000);

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');

  // SSE 스트림
  if (u.pathname === '/events') {
    const acct = ACCOUNTS[u.searchParams.get('acct')];
    if (!acct) { res.writeHead(403); return res.end('unknown account'); }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
    });
    const client = { res, acct };
    clients.add(client);
    res.write(`data: ${JSON.stringify(scoped(sim.snapshot(), acct))}\n\n`);
    req.on('close', () => clients.delete(client));
    return;
  }

  // 명령 API
  if (u.pathname === '/api/cmd' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      let out;
      try {
        const { acct: acctId, cmd, ...args } = JSON.parse(body || '{}');
        const acct = ACCOUNTS[acctId];
        if (!acct) out = { ok: false, msg: '알 수 없는 계정' };
        else if (acct.role === 'driver') {
          // 기사는 본인 차량의 배송 완료 체크만 가능
          if (cmd !== 'complete' || args.vehicleId !== acct.vehicleId) out = { ok: false, msg: '권한이 없습니다' };
          else out = sim.command('complete', args);
        } else if (acct.role === 'controller' || acct.role === 'admin') {
          out = sim.command(cmd, args);
        } else out = { ok: false, msg: '권한이 없습니다' };
      } catch (e) { out = { ok: false, msg: String(e.message || e) }; }
      pushAll();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // 계정 목록 (로그인 화면용)
  if (u.pathname === '/api/accounts') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(Object.values(ACCOUNTS)));
  }

  // 정적 파일
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  p = path.normalize(p).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`미트박스 TMS 데모 — http://localhost:${PORT}`);
});
