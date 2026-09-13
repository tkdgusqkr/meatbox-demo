// 정적(서버리스) 모드 동기화 버스.
// - 같은 브라우저의 창들: BroadcastChannel
// - 다른 기기(폰·노트북): "방 코드"로 공개 MQTT 브로커(WebSocket)를 중계 — 서버·계정 불필요
// 리더 선출: 메시지 하트비트. 가장 먼저 열린 창(가장 작은 ID)이 시뮬레이션을 구동하고,
// 리더가 사라지면 다른 창/기기가 승계한다 (시뮬레이션은 초기화됨).
window.TMSBus = (() => {
  const qs2 = new URLSearchParams(location.search);
  let ROOM = (qs2.get('room') || '').trim().toUpperCase();
  try {
    if (ROOM) localStorage.setItem('tms-room', ROOM);
    else ROOM = (localStorage.getItem('tms-room') || '').trim().toUpperCase();
  } catch {}
  const BROKERS = qs2.get('broker') ? [qs2.get('broker')] : [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081',
  ];
  const TOPIC = 'meatbox-tms/v1/' + ROOM;
  const CH = 'BroadcastChannel' in window ? new BroadcastChannel('meatbox-tms') : null;
  const ID = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ACCOUNTS = window.TMSSim.ACCOUNTS;

  let sim = null, myAcct = null, onStateCb = null, lastFull = null;
  let mq = null, mqState = ROOM ? 'connecting' : 'off'; // off | connecting | on | error
  let lastBeat = Date.now(); // 시작 후 유예 시간을 두고 리더 승격 (기존 리더 탐지)
  const statusCbs = [];

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

  function emitStatus() {
    const s = { room: ROOM || null, net: ROOM ? mqState : 'off', leader: !!sim };
    statusCbs.forEach((f) => { try { f(s); } catch {} });
  }

  function dispatch(full) {
    lastFull = full;
    if (onStateCb && myAcct && ACCOUNTS[myAcct]) onStateCb(scoped(full, ACCOUNTS[myAcct]));
  }

  function sendMsg(m) {
    m.from = ID;
    if (CH) { try { CH.postMessage(m); } catch {} }
    if (mq && mqState === 'on' && ROOM) { try { mq.publish(TOPIC, JSON.stringify(m)); } catch {} }
  }

  function publishState() {
    if (!sim) return;
    const full = sim.snapshot();
    sendMsg({ type: 'state', full });
    dispatch(full); // 자기 자신에게는 채널 메시지가 오지 않음
  }

  function handle(m) {
    if (!m || m.from === ID) return; // MQTT 는 자기 발행분도 되돌아온다
    if (m.type === 'beat' || m.type === 'state') {
      if (sim && m.from < ID) { sim = null; emitStatus(); }   // 리더 충돌: 먼저 열린 쪽에 양보
      if (sim && m.from > ID) return;                          // 상대가 곧 양보할 것
      lastBeat = Date.now();
      if (m.type === 'state') dispatch(m.full);
    } else if (m.type === 'cmd' && sim) {
      const acct = ACCOUNTS[m.acct];
      if (allowed(acct, m.cmd, m.args)) { sim.command(m.cmd, m.args); publishState(); }
    }
  }

  function step() {
    if (sim) {
      sendMsg({ type: 'beat' });
      sim.tick();
      publishState();
    } else if (Date.now() - lastBeat > 3500 + Math.random() * 1000) {
      sim = window.TMSSim.createSim(); // 리더 승격 (첫 창이거나 이전 리더 종료)
      emitStatus();
      publishState();
    }
  }

  function connectMqtt(i = 0) {
    if (!ROOM || !window.mqtt) { if (ROOM) { mqState = 'error'; emitStatus(); } return; }
    if (i >= BROKERS.length) { mqState = 'error'; emitStatus(); return; }
    mqState = 'connecting'; emitStatus();
    const c = window.mqtt.connect(BROKERS[i], {
      clientId: 'tms_' + ID, clean: true, connectTimeout: 6000, reconnectPeriod: 3000,
    });
    let opened = false;
    c.on('connect', () => { opened = true; mq = c; mqState = 'on'; c.subscribe(TOPIC); emitStatus(); });
    c.on('message', (t, payload) => { try { handle(JSON.parse(payload.toString())); } catch {} });
    c.on('error', () => { if (!opened) { try { c.end(true); } catch {} connectMqtt(i + 1); } });
    c.on('close', () => { if (opened && mqState === 'on') { mqState = 'connecting'; emitStatus(); } });
  }

  if (CH) CH.onmessage = (e) => handle(e.data);

  // 정적 모드에서만 구동 (서버 모드에서는 server.js 가 담당)
  if (window.TMS_STATIC) {
    setInterval(step, 1000);
    connectMqtt();
  }

  return {
    connect(acctId, onState) {
      myAcct = acctId; onStateCb = onState;
      if (lastFull) dispatch(lastFull);
    },
    async cmd(acctId, command, args = {}) {
      const acct = ACCOUNTS[acctId];
      if (!allowed(acct, command, args)) return { ok: false, msg: '권한이 없습니다' };
      if (sim) { const out = sim.command(command, args); publishState(); return out; }
      sendMsg({ type: 'cmd', acct: acctId, cmd: command, args });
      return { ok: true };
    },
    accounts() { return Object.values(ACCOUNTS); },
    room() { return ROOM || null; },
    setRoom(code) {
      const c = (code || '').trim().toUpperCase();
      try {
        if (c) localStorage.setItem('tms-room', c);
        else localStorage.removeItem('tms-room');
      } catch {}
      const u = new URL(location.href);
      if (c) u.searchParams.set('room', c); else u.searchParams.delete('room');
      location.href = u.toString(); // 새 방 설정은 새로고침으로 적용
    },
    makeRoom() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let c = '';
      for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
      return c;
    },
    onStatus(cb) { statusCbs.push(cb); emitStatus(); },
  };
})();
