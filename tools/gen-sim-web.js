// lib/data.js + lib/sim.js 를 브라우저 번들(public/sim-web.js)로 생성한다.
// 정적(서버리스) 배포 모드에서 시뮬레이션을 브라우저 안에서 구동하기 위함.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const data = fs.readFileSync(path.join(root, 'lib/data.js'), 'utf8')
  .replace(/module\.exports\s*=\s*\{[^}]*\};?/, '');
const sim = fs.readFileSync(path.join(root, 'lib/sim.js'), 'utf8')
  .replace(/const\s*\{[^}]*\}\s*=\s*require\([^)]*\);?/, '')
  .replace(/module\.exports\s*=\s*\{[^}]*\};?/, '');

fs.writeFileSync(path.join(root, 'public/sim-web.js'),
`// 자동 생성 파일 — 수정하지 말 것. 원본: lib/data.js, lib/sim.js (tools/gen-sim-web.js 로 재생성)
window.TMSSim = (() => {
${data}
${sim}
return { createSim, ACCOUNTS, MFC, ACCURACY };
})();
`);
console.log('generated public/sim-web.js');
