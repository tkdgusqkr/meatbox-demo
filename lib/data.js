// 미트박스 TMS 데모 — 고정 데이터 (계정 / 차량 / 배송지 / 리포트 목업)
// 좌표는 성동·광진 권역의 실제 동 단위 근사 좌표를 사용한다.

const MFC = { name: '미트박스 성동 MFC', pos: { lat: 37.5446, lng: 127.0562 } };

const INCIDENT = {
  name: '성수대교 진입로 사고',
  desc: 'TMAP·네이버지도 교통정보 수신 — 3중 추돌, 정체 심각',
  pos: { lat: 37.5449, lng: 127.0375 },
};

// stop: { seq, shop, cust, dong, lat, lng, boxes, items, accountId }
const VEHICLES = [
  {
    id: 'v1',
    name: '성동 01호차',
    driver: '박 기사',
    driverAccountId: 'drv-park',
    region: '성동 권역',
    color: '#C0392F',
    auto: false, // 기사 앱에서 완료 체크 (수동)
    stops: [
      { seq: 1,  shop: '축산왕갈비',     cust: '오 사장', dong: '마장동', lat: 37.5661, lng: 127.0435, boxes: 5, items: '소갈비 외 2종' },
      { seq: 2,  shop: '한우명가',       cust: '이 사장', dong: '마장동', lat: 37.5647, lng: 127.0448, boxes: 4, items: '소갈비·차돌박이', accountId: 'cust-lee' },
      { seq: 3,  shop: '곱창의신화',     cust: '장 사장', dong: '왕십리', lat: 37.5612, lng: 127.0378, boxes: 6, items: '곱창·대창 외 1종' },
      { seq: 4,  shop: '돼지익는마을',   cust: '한 사장', dong: '행당동', lat: 37.5576, lng: 127.0362, boxes: 7, items: '삼겹살·목살' },
      { seq: 5,  shop: '금호정육점',     cust: '윤 사장', dong: '금호동', lat: 37.5483, lng: 127.0230, boxes: 8, items: '돼지 지육 부분육' },
      { seq: 6,  shop: '옥수한판',       cust: '서 사장', dong: '옥수동', lat: 37.5411, lng: 127.0181, boxes: 4, items: '항정살·갈매기살' },
      { seq: 7,  shop: '금돼지식당',     cust: '김 사장', dong: '성수동', lat: 37.5424, lng: 127.0557, boxes: 6, items: '삼겹살 외 3종', accountId: 'cust-kim' },
      { seq: 8,  shop: '수제버거랩',     cust: '문 사장', dong: '성수동2가', lat: 37.5384, lng: 127.0561, boxes: 3, items: '우육 패티용 정육' },
      { seq: 9,  shop: '송정식당',       cust: '배 사장', dong: '송정동', lat: 37.5527, lng: 127.0690, boxes: 5, items: '삼겹살·앞다리' },
      { seq: 10, shop: '용답축산',       cust: '신 사장', dong: '용답동', lat: 37.5617, lng: 127.0525, boxes: 9, items: '돼지 박스육 도매' },
      { seq: 11, shop: '사근한상',       cust: '유 사장', dong: '사근동', lat: 37.5599, lng: 127.0475, boxes: 4, items: '국거리·불고기' },
      { seq: 12, shop: '응봉숯불',       cust: '전 사장', dong: '응봉동', lat: 37.5500, lng: 127.0322, boxes: 5, items: '갈비살·살치살' },
    ],
  },
  {
    id: 'v2',
    name: '광진 02호차',
    driver: '최 기사',
    driverAccountId: 'drv-choi',
    region: '광진 권역',
    color: '#33608F',
    auto: true, // 시연 중 자동 완료 (기사 계정 미조작 차량)
    stops: [
      { seq: 1,  shop: '건대곱창',       cust: '노 사장', dong: '화양동', lat: 37.5450, lng: 127.0690, boxes: 6, items: '곱창·막창' },
      { seq: 2,  shop: '자양정육',       cust: '고 사장', dong: '자양동', lat: 37.5350, lng: 127.0820, boxes: 8, items: '돼지 부분육 도매' },
      { seq: 3,  shop: '구의축산',       cust: '임 사장', dong: '구의동', lat: 37.5430, lng: 127.0868, boxes: 7, items: '소 부분육 도매' },
      { seq: 4,  shop: '광장불백',       cust: '황 사장', dong: '광장동', lat: 37.5465, lng: 127.1030, boxes: 4, items: '불고기·제육용' },
      { seq: 5,  shop: '능동한우',       cust: '송 사장', dong: '능동',   lat: 37.5527, lng: 127.0805, boxes: 5, items: '한우 등심·안심' },
      { seq: 6,  shop: '중곡축산도매',   cust: '안 사장', dong: '중곡동', lat: 37.5650, lng: 127.0843, boxes: 9, items: '혼합 박스육' },
      { seq: 7,  shop: '군자식당',       cust: '천 사장', dong: '군자동', lat: 37.5552, lng: 127.0745, boxes: 3, items: '삼겹살·오겹살' },
      { seq: 8,  shop: '화양삼겹',       cust: '추 사장', dong: '화양동', lat: 37.5478, lng: 127.0713, boxes: 5, items: '삼겹살 외 1종' },
      { seq: 9,  shop: '리버사이드정육', cust: '방 사장', dong: '자양2동', lat: 37.5320, lng: 127.0770, boxes: 6, items: '수입 냉장 부분육' },
      { seq: 10, shop: '아차산숯불',     cust: '표 사장', dong: '구의2동', lat: 37.5498, lng: 127.0920, boxes: 4, items: '갈비·왕구이' },
    ],
  },
];

const ACCOUNTS = {
  'cust-kim': { id: 'cust-kim', role: 'customer', name: '김 사장', shop: '금돼지식당', dong: '성수동', desc: '삼겹살 외 3종 · 6박스 — 성동 01호차 7번째' },
  'cust-lee': { id: 'cust-lee', role: 'customer', name: '이 사장', shop: '한우명가', dong: '마장동', desc: '소갈비·차돌박이 · 4박스 — 성동 01호차 2번째' },
  'drv-park': { id: 'drv-park', role: 'driver', name: '박 기사', vehicleId: 'v1', desc: '성동 권역 전용차 · 착지 12곳' },
  'drv-choi': { id: 'drv-choi', role: 'driver', name: '최 기사', vehicleId: 'v2', desc: '광진 권역 전용차 · 착지 10곳' },
  'adm-jung': { id: 'adm-jung', role: 'admin', name: '정 매니저', desc: '관제팀 — 메인 관제' },
  'adm-kang': { id: 'adm-kang', role: 'admin', name: '강 팀장', desc: '관제팀 — 동시 접속 시연용' },
  'ctrl':     { id: 'ctrl', role: 'controller', name: '시연 컨트롤러', desc: '시나리오 이벤트 주입 리모컨' },
};

// ETA 정확도 리포트 목업 (최근 30일, ±15분 적중률 %)
const ACCURACY = {
  days: [66, 67, 65, 68, 69, 68, 70, 69, 71, 72, 71, 73, 74, 73, 75, 76, 75, 77, 76, 78, 79, 78, 80, 79, 81, 80, 82, 81, 82, 83],
  target: 80,
  reasons: [
    { label: '실시간 교통 이슈', pct: 44 },
    { label: '기사 순서 변경', pct: 33 },
    { label: '하차 지연·정차', pct: 23 },
  ],
};

module.exports = { MFC, INCIDENT, VEHICLES, ACCOUNTS, ACCURACY };
