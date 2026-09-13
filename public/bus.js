// 정적(서버리스) 모드 — 시뮬레이션을 브라우저 안에서 구동하고,
// 같은 브라우저의 다른 창들과 BroadcastChannel 로 실시간 동기화한다.
// 리더 선출: localStorage 하트비트. 리더 창이 닫히면 다른 창이 승계하며 시뮬레이션은 초기화된다.
window.TMSBus = (() => {
  const CH = 'BroadcastChannel' in window ? new BroadcastChannel('meatbox-tms') : null;
  const ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const LEAD_KEY = 'tms-leader';
  const ACCOUNTS = window.TMSSim.ACCOUNTS;
  let sim = null, myAcct = null, onStateCb = null, lastFull = null;

  // ---- 서버(server.js)와 동일한 역할별 스코핑 ----
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

  function allowed(acct, cmd, args) {
    if (!acct) return false;
    if (acct.role === 'driver') return cmd === 'complete' && args.vehicleId === acct.vehicleId;
    return acct.role === 'controller' || acct.role === 'admin';
  }

  function dispatch(full) {
    lastFull = full;
    if (onStateCb && myAcct && ACCOUNTS[myAcct]) onStateCb(scoped(full, ACCOUNTS[myAcct]));
  }

  function publish() {
    if (!sim) return;
    const full = sim.snapshot();
    if (CH) CH.postMessage({ type: 'state', full });
    dispatch(full); // BroadcastChannel 은 자기 자신에게는 전달되지 않음
  }

  function beat() {
    try { localStorage.setItem(LEAD_KEY, JSON.stringify({ id: ID, t: Date.now() })); } catch {}
  }

  function leaderStep() {
    let j = null;
    try { j = JSON.parse(localStorage.getItem(LEAD_KEY) || 'null'); } catch {}
    const fresh = j && Date.now() - j.t < 3500;
    if (sim) {
      if (fresh && j.id !== ID && j.id < ID) { sim = null; return; } // 리더 충돌 시 양보
      beat(); sim.tick(); publish();
    } else if (!fresh) {
      sim = window.TMSSim.createSim(); // 리더 승격 (첫 실행 또는 이전 리더 창 종료)
      beat(); publish();
    }
  }

  if (CH) CH.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'state') { if (!sim) dispatch(m.full); }
    else if (m.type === 'cmd' && sim) {
      const acct = ACCOUNTS[m.acct];
      if (allowed(acct, m.cmd, m.args)) { sim.command(m.cmd, m.args); publish(); }
    }
  };

  setInterval(leaderStep, 1000);
  leaderStep();

  return {
    connect(acctId, onState) {
      myAcct = acctId; onStateCb = onState;
      if (lastFull) dispatch(lastFull);
    },
    async cmd(acctId, command, args = {}) {
      const acct = ACCOUNTS[acctId];
      if (!allowed(acct, command, args)) return { ok: false, msg: '권한이 없습니다' };
      if (sim) { const out = sim.command(command, args); publish(); return out; }
      if (CH) { CH.postMessage({ type: 'cmd', acct: acctId, cmd: command, args }); return { ok: true }; }
      return { ok: false, msg: '동기화 채널을 사용할 수 없습니다' };
    },
    accounts() { return Object.values(ACCOUNTS); },
  };
})();
