라운드킷 v1.0 - 3종 운동 타이머 PWA

구성: index.html, styles.css, app.js, manifest.webmanifest, sw.js, icon-192.png, icon-512.png

사용법
1. 간단한 미리보기: index.html을 컴퓨터 브라우저에서 열어 타이머 화면을 확인합니다.
   (로컬 파일에서는 PWA 설치, 화면 유지, 오프라인 캐싱이 제한됩니다.)
2. 공유/설치: 전체 파일을 GitHub 저장소에 업로드한 뒤 GitHub Pages를 켭니다.
   Settings > Pages > Build and deployment > Deploy from a branch > main / (root) > Save.
3. 생성된 HTTPS 주소에 접속합니다.
   iPhone: Safari 공유 버튼 > 홈 화면에 추가.
   Android: Chrome 메뉴 > 앱 설치 또는 홈 화면에 추가.
4. 타이머 앱에서 운동을 시작한 뒤 화면 유지와 알림음을 실제 기기에서 테스트합니다.

주의
- 웹앱은 화면이 꺼지거나 백그라운드로 들어가면 음성 알림이 보장되지 않습니다.
- Wake Lock은 HTTPS, 브라우저 지원 및 절전 모드에 영향을 받습니다.
- 복싱의 +/- 버튼은 운동 30초, 휴식 10초 간격이고, 숫자를 직접 입력하면 1초 단위로 설정 가능합니다.
- 설정과 색상은 각 기기의 로컬 저장소에 저장됩니다.
- 설정값을 바꾸거나 모드를 전환하면 현재 타이머는 초기화됩니다.

[v1.1] 복싱 벨 WAV 및 알림음 테스트 버튼 추가. 아이폰은 사파리 오디오 제한을 확인하세요.
