// 미트박스 TMS 데모 — 시뮬레이션 엔진
// 시계는 "시뮬레이션 분" 단위로 흐른다 (기본 배속: 실제 1초 = 시뮬 30초).
// 상태 9단계: 주문 접수 → 결제 완료 → 피킹 중 → 라벨 부착 → 상차 대기
//            → 배송 출발 → N번째 순서 배송 예정 → 인근 배송 중 → 배송 완료

const { MFC, INCIDENT, VEHICLES, ACCOUNTS, ACCURACY } = require('./data');

const SPEED_KMH = 22;      // 도심 평균 주행 속도
const BASE_LEG_MIN = 3;    // 구간당 기본 소요(신호·주차)
const SERVICE_MIN = 6;     // 착지당 하차 처리 시간
const ETA_WINDOW = 30;     // ETA 표시 범위(분)
const NOTIFY_SHIFT = 20;   // 이 값 이상 ETA가 밀리면 고객 안내 발송

function havKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function fmt(min) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function createSim() {
  let S;

  function log(level, text, vehicleId) {
    S.events.unshift({ t: fmt(S.clockMin), level, text, vehicleId: vehicleId || null });
    if (S.events.length > 120) S.events.pop();
  }

  function notify(d, kind, title, body) {
    S.notifications.unshift({
      t: fmt(S.clockMin), kind, title, body,
      accountId: d.accountId, custName: d.custName, shop: d.shop,
      deliveryId: d.id, channel: '앱 푸시 · 알림톡',
    });
    if (S.notifications.length > 200) S.notifications.pop();
  }

  function setStatus(d, status) {
    if (d.status === status) return;
    d.status = status;
    d.history.push({ st: status, at: fmt(S.clockMin) });
  }

  function reset() {
    S = {
      clockMin: 3 * 60 + 40, // 03:40 새벽
      speed: 30,             // 실제 1초당 시뮬 30초
      running: true,
      phase: 'MFC',          // MFC → PICK → LABEL → LOAD → OUT
      incident: null,
      vehicles: {}, deliveries: {}, events: [], notifications: [],
    };
    for (const v of VEHICLES) {
      S.vehicles[v.id] = {
        id: v.id, name: v.name, driver: v.driver, driverAccountId: v.driverAccountId,
        region: v.region, color: v.color, auto: v.auto,
        state: 'MFC', pos: { ...MFC.pos }, cursor: 0,
        order: v.stops.map((s) => v.id + '-' + s.seq),
        legStart: 0, legDur: 0, legFrom: null, legTo: null, arrivedAt: 0,
        trafficMult: 1, dwellExtra: 0,
      };
      for (const s of v.stops) {
        const orderAt = '전일 ' + fmt(19 * 60 + 30 + ((s.seq * 37) % 150));
        S.deliveries[v.id + '-' + s.seq] = {
          id: v.id + '-' + s.seq, vehicleId: v.id, origSeq: s.seq,
          shop: s.shop, custName: s.cust, dong: s.dong,
          pos: { lat: s.lat, lng: s.lng }, boxes: s.boxes, items: s.items,
          accountId: s.accountId || null,
          status: '결제 완료', queuePos: null, eta: null,
          notifiedEtaStart: null, nearNotified: false, photo: false,
          history: [
            { st: '주문 접수', at: orderAt },
            { st: '결제 완료', at: orderAt.replace(/\d\d:\d\d/, (t) => fmt(parseInt(t) * 60 + parseInt(t.slice(3)) + 1)) },
          ],
        };
      }
    }
    log('info', '시뮬레이션 초기화 — 주문 22건 접수·결제 완료 (성동 12 · 광진 10)');
  }

  // ---- MFC 스캔 단계 ----
  const SCAN_FLOW = {
    PICK:  { prev: 'MFC',   status: '피킹 중',   label: '피킹 스캔' },
    LABEL: { prev: 'PICK',  status: '라벨 부착', label: '라벨 부착 스캔' },
    LOAD:  { prev: 'LABEL', status: '상차 대기', label: '상차 스캔' },
  };

  function scan(step) {
    const f = SCAN_FLOW[step];
    if (!f || S.phase !== f.prev) return { ok: false, msg: '스캔 순서가 아닙니다' };
    S.phase = step;
    for (const d of Object.values(S.deliveries)) setStatus(d, f.status);
    log('info', `MFC ${f.label} 22건 처리 — 상태 자동 전환 (성동 12 · 광진 10)`);
    return { ok: true };
  }

  function depart() {
    if (S.phase !== 'LOAD') return { ok: false, msg: '상차 스캔이 먼저 필요합니다' };
    S.phase = 'OUT';
    for (const v of Object.values(S.vehicles)) {
      v.state = 'RUN';
      startLeg(v);
      for (const id of v.order) setStatus(S.deliveries[id], '배송 출발');
      log('info', `${v.name} 배송 출발 — 착지 ${v.order.length}곳 (${v.driver})`, v.id);
    }
    recalc({ silent: true }); // 최초 ETA 산출 (변경 알림 없음)
    for (const v of Object.values(S.vehicles)) {
      for (const id of v.order) {
        const d = S.deliveries[id];
        d.notifiedEtaStart = d.eta ? d.eta.s : null;
        notify(d, 'depart', '배송이 시작되었습니다',
          `${d.eta.label} 도착 예정 · ${d.queuePos}번째 배송 예정입니다`);
      }
    }
    return { ok: true };
  }

  function startLeg(v) {
    const next = S.deliveries[v.order[v.cursor]];
    v.legFrom = { ...v.pos };
    v.legTo = { ...next.pos };
    v.legStart = S.clockMin;
    v.legDur = BASE_LEG_MIN + (havKm(v.legFrom, v.legTo) / SPEED_KMH) * 60 * v.trafficMult;
  }

  // ---- 배송 완료 (기사 앱 체크 또는 자동) ----
  function complete(vehicleId, deliveryId, photo) {
    const v = S.vehicles[vehicleId];
    if (!v || v.state !== 'STOP') return { ok: false, msg: '하차 중인 착지가 없습니다' };
    const currentId = v.order[v.cursor];
    if (deliveryId && deliveryId !== currentId) return { ok: false, msg: '현재 착지가 아닙니다' };
    const d = S.deliveries[currentId];
    d.photo = photo !== false;
    setStatus(d, '배송 완료');
    d.queuePos = null; d.eta = null;
    notify(d, 'done', '배송이 완료되었습니다',
      `«${d.shop}» ${d.boxes}박스 전달 완료${d.photo ? ' · 문 앞 사진 첨부' : ''}`);
    log('info', `${v.name} 배송 완료 (${v.cursor + 1}/${v.order.length}) — «${d.shop}» ${d.dong}${d.photo ? ' · 사진 첨부' : ''}`, v.id);
    v.cursor += 1; v.dwellExtra = 0;
    if (v.cursor < v.order.length) { v.state = 'RUN'; startLeg(v); }
    else { v.state = 'DONE'; log('info', `${v.name} 전 착지 배송 완료 — 운행 종료`, v.id); }
    recalc({});
    return { ok: true };
  }

  // ---- 이벤트 주입 ----
  function injectIncident() {
    if (S.incident) return { ok: false, msg: '이미 교통 경보가 활성화되어 있습니다' };
    S.incident = { ...INCIDENT, at: fmt(S.clockMin) };
    const v = S.vehicles.v1;
    v.trafficMult = 1.8;
    if (v.state === 'RUN') v.legDur += 25; // 정체 구간 통과 지연
    log('alert', `교통 경보 — ${INCIDENT.name} · ${v.name} 경로 영향, 우회 경로 재탐색`, 'v1');
    const n = recalc({});
    if (n > 0) log('alert', `ETA 자동 재계산 — 지연 안내 ${n}건 발송 (${v.name} 잔여 배송)`, 'v1');
    return { ok: true };
  }

  function reorder(vehicleId) {
    const v = S.vehicles[vehicleId || 'v1'];
    if (!v || (v.state !== 'RUN' && v.state !== 'STOP')) return { ok: false, msg: '운행 중이 아닙니다' };
    if (v.order.length - v.cursor < 3) return { ok: false, msg: '조정할 잔여 착지가 부족합니다' };
    const moved = v.order.splice(v.cursor + 1, 1)[0];
    v.order.push(moved);
    const d = S.deliveries[moved];
    log('info', `기사 앱 이벤트 — 배송 순서 변경: «${d.shop}» ${d.dong} 후순위 조정 (${v.name} · 현장 사정)`, v.id);
    recalc({});
    return { ok: true };
  }

  function dwell(vehicleId, min) {
    const v = S.vehicles[vehicleId || 'v1'];
    const m = min || 15;
    if (!v || (v.state !== 'RUN' && v.state !== 'STOP')) return { ok: false, msg: '운행 중이 아닙니다' };
    if (v.state === 'STOP') v.dwellExtra += m; else v.legDur += m;
    log('alert', `하차 지연 감지 — ${v.name} 앞 배송지 정차 ${m}분 연장, 이후 일정 지연 예측`, v.id);
    const n = recalc({});
    if (n > 0) log('alert', `ETA 자동 재계산 — 지연 안내 ${n}건 발송 (${v.name})`, v.id);
    return { ok: true };
  }

  function forceComplete(vehicleId) {
    const v = S.vehicles[vehicleId];
    if (!v) return { ok: false };
    if (v.state === 'RUN') { // 남은 구간을 건너뛰고 도착 처리
      S.clockMin = Math.max(S.clockMin, v.legStart + v.legDur);
      arrive(v);
    }
    if (v.state === 'STOP') return complete(vehicleId, null, true);
    return { ok: false, msg: '완료할 착지가 없습니다' };
  }

  // ---- 시간 진행 ----
  function arrive(v) {
    v.state = 'STOP'; v.pos = { ...v.legTo }; v.arrivedAt = S.clockMin;
  }

  function stepMinutes(dt) {
    S.clockMin += dt;
    for (const v of Object.values(S.vehicles)) {
      if (v.state === 'RUN') {
        const p = Math.min(1, (S.clockMin - v.legStart) / v.legDur);
        v.pos = {
          lat: v.legFrom.lat + (v.legTo.lat - v.legFrom.lat) * p,
          lng: v.legFrom.lng + (v.legTo.lng - v.legFrom.lng) * p,
        };
        if (p >= 1) arrive(v);
      }
      if (v.state === 'STOP' && v.auto &&
          S.clockMin - v.arrivedAt >= SERVICE_MIN + v.dwellExtra) {
        complete(v.id, null, true);
      }
    }
  }

  function tick() {
    if (!S.running) return;
    let dt = S.speed / 60; // 시뮬 분
    while (dt > 0) { const h = Math.min(0.5, dt); stepMinutes(h); dt -= h; }
    recalc({});
  }

  function skip(min) {
    let dt = min;
    while (dt > 0) { const h = Math.min(0.5, dt); stepMinutes(h); dt -= h; recalc({}); }
    log('info', `시간 빨리감기 +${min}분 → ${fmt(S.clockMin)}`);
    return { ok: true };
  }

  // ---- ETA·순번 재계산. 반환값: 발송된 지연 안내 건수 ----
  function recalc(opts) {
    let notified = 0;
    if (S.phase !== 'OUT') return notified;
    for (const v of Object.values(S.vehicles)) {
      if (v.state === 'MFC' || v.state === 'DONE') continue;
      let t; // 다음 착지 도착 시각
      if (v.state === 'RUN') t = Math.max(S.clockMin, v.legStart + v.legDur);
      else t = S.clockMin; // STOP: 현재 착지에 이미 도착
      let prevPos = null;
      for (let i = v.cursor; i < v.order.length; i++) {
        const d = S.deliveries[v.order[i]];
        if (i > v.cursor) {
          t += BASE_LEG_MIN + (havKm(prevPos, d.pos) / SPEED_KMH) * 60 * v.trafficMult;
        }
        const arrivalEta = t;
        // 완료 처리 시간을 더해 다음 착지 기준 시각으로
        if (i === v.cursor && v.state === 'STOP') {
          t = Math.max(t, v.arrivedAt) + Math.max(0, v.arrivedAt + SERVICE_MIN + v.dwellExtra - S.clockMin);
        } else {
          t = arrivalEta + SERVICE_MIN + (i === v.cursor ? v.dwellExtra : 0);
        }
        prevPos = d.pos;

        const ws = Math.floor(arrivalEta / ETA_WINDOW) * ETA_WINDOW;
        d.eta = { s: ws, e: ws + ETA_WINDOW, label: `${fmt(ws)} ~ ${fmt(ws + ETA_WINDOW)}` };
        d.queuePos = i - v.cursor + 1;

        // 상태: 다음 착지면 "인근 배송 중", 아니면 "N번째 순서 배송 예정"
        if (d.queuePos === 1) {
          if (d.status !== '인근 배송 중') {
            setStatus(d, '인근 배송 중');
            if (!d.nearNotified) {
              d.nearNotified = true;
              notify(d, 'near', '기사님이 인근에서 배송 중입니다', `곧 도착합니다 · ${d.eta.label} 도착 예정`);
            }
          }
        } else {
          setStatus(d, 'N번째 순서 배송 예정');
        }

        // ETA 변동 안내 (기준 이상 밀릴 때만)
        if (!opts.silent && d.notifiedEtaStart != null &&
            Math.abs(ws - d.notifiedEtaStart) >= NOTIFY_SHIFT) {
          notify(d, 'eta', '배송 예정 시간이 변경되었습니다', `새 도착 예정: ${d.eta.label}`);
          d.notifiedEtaStart = ws;
          notified += 1;
        }
      }
    }
    return notified;
  }

  // ---- 스냅샷 (역할별 스코핑은 server.js에서) ----
  function snapshot() {
    const done = Object.values(S.deliveries).filter((d) => d.status === '배송 완료').length;
    return {
      clock: fmt(S.clockMin), clockMin: S.clockMin, speed: S.speed, running: S.running,
      phase: S.phase, incident: S.incident, mfc: MFC,
      vehicles: Object.values(S.vehicles).map((v) => ({
        id: v.id, name: v.name, driver: v.driver, driverAccountId: v.driverAccountId,
        region: v.region, color: v.color, auto: v.auto, state: v.state,
        pos: v.pos, cursor: v.cursor, order: v.order, total: v.order.length,
        done: v.cursor, trafficMult: v.trafficMult,
      })),
      deliveries: S.deliveries,
      events: S.events.slice(0, 80),
      notifications: S.notifications.slice(0, 120),
      stats: { done, total: Object.keys(S.deliveries).length, notif: S.notifications.length },
      accuracy: ACCURACY,
    };
  }

  reset();
  return {
    tick, snapshot,
    command(cmd, args) {
      switch (cmd) {
        case 'scan': return scan(args.step);
        case 'depart': return depart();
        case 'complete': return complete(args.vehicleId, args.deliveryId, args.photo);
        case 'incident': return injectIncident();
        case 'reorder': return reorder(args.vehicleId);
        case 'dwell': return dwell(args.vehicleId, args.min);
        case 'force': return forceComplete(args.vehicleId);
        case 'skip': return skip(Math.min(120, Math.max(1, args.min || 10)));
        case 'speed': S.speed = Math.min(240, Math.max(1, args.value || 30)); return { ok: true };
        case 'pause': S.running = false; return { ok: true };
        case 'resume': S.running = true; return { ok: true };
        case 'auto': { const v = S.vehicles[args.vehicleId]; if (v) v.auto = !!args.on; return { ok: true }; }
        case 'reset': reset(); return { ok: true };
        default: return { ok: false, msg: '알 수 없는 명령: ' + cmd };
      }
    },
  };
}

module.exports = { createSim };
