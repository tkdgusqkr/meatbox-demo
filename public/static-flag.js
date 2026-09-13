// 정적(서버리스) 모드 플래그.
// Node 서버(server.js)로 서빙할 때는 false 로 두고 SSE 를 사용한다.
// GitHub Pages 배포 시 tools/deploy-pages.sh 가 이 파일을 `window.TMS_STATIC = true;` 로 덮어쓴다.
window.TMS_STATIC = (location.protocol === 'file:');
