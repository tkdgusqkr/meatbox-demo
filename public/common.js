// 미트박스 TMS 데모 — 공통 클라이언트 유틸
const qs = new URLSearchParams(location.search);
const ACCT = qs.get('acct');

function requireAcct() {
  if (!ACCT) location.href = '/';
  return ACCT;
}

// SSE 연결: 서버가 계정 권한에 맞게 스코핑한 상태를 1초마다 내려준다
function connect(onState) {
  const es = new EventSource('/events?acct=' + encodeURIComponent(ACCT));
  es.onmessage = (e) => {
    try { onState(JSON.parse(e.data)); } catch (err) { console.error(err); }
  };
  es.onerror = () => { /* 자동 재접속 */ };
  return es;
}

async function cmd(command, args = {}) {
  const r = await fetch('/api/cmd', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acct: ACCT, cmd: command, ...args }),
  });
  const out = await r.json();
  if (!out.ok && out.msg) toast(out.msg);
  return out;
}

// 간단 토스트
function toast(text) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#212836;color:#fff;padding:9px 18px;border-radius:10px;font-size:13px;z-index:9999;transition:opacity .3s';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.style.opacity = '0'; }, 2600);
}

// 푸시 배너 (모바일 프레임 내부)
function showPush(layer, title, body) {
  const el = document.createElement('div');
  el.className = 'push-banner';
  el.innerHTML = `<div class="src">미트박스 · 지금</div><b></b><span></span>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = body;
  layer.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .5s'; el.style.opacity = '0'; }, 4200);
  setTimeout(() => el.remove(), 4800);
}

// 새 알림 감지 (t+title 키 기준)
function makeNotifWatcher(onNew) {
  let seen = null;
  return (list) => {
    if (!list) return;
    if (seen === null) { seen = new Set(list.map((n) => n.t + '|' + n.title + '|' + n.deliveryId)); return; }
    for (const n of [...list].reverse()) {
      const k = n.t + '|' + n.title + '|' + n.deliveryId;
      if (!seen.has(k)) { seen.add(k); onNew(n); }
    }
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
