# Render 배포

이 프로젝트는 React 정적 파일과 Socket.IO 서버를 하나의 Docker 기반 Render Web Service로 실행한다.

## 사전 조건

- GitHub `main` 브랜치에 프로젝트 전체가 업로드되어 있어야 한다.
- 저장소 루트에 `render.yaml` 파일이 포함되어 있어야 한다.

## 최초 배포

1. Render Dashboard에서 GitHub 계정으로 로그인한다.
2. **New +** → **Blueprint**를 선택한다.
3. `hyeonw00512/sabotaji` 저장소와 `main` 브랜치를 선택한다.
4. Blueprint 설정에서 서비스 이름 `sabotaji`, 지역 `Singapore`, 플랜 `Free`를 확인한다.
5. **Apply** 또는 **Deploy Blueprint**를 선택한다.
6. 배포가 끝나면 서비스 URL 뒤에 `/api/health`를 붙여 연다.

정상 응답 예시:

```json
{"ok":true,"now":0,"uptimeSeconds":0}
```

## 배포 후 확인

- 기본 주소에서 시작 화면이 표시되는지 확인한다.
- 서로 다른 브라우저 창에서 방 생성·참가·채팅을 확인한다.
- Socket.IO 연결이 되는지 확인한다.

## 무료 플랜 유의 사항

무료 Web Service는 장시간 요청이 없으면 절전 상태가 될 수 있으며, 서비스가 다시 시작되면 로컬 파일 기반의 진행 중 방·기록 데이터는 유지되지 않을 수 있다. 지속적인 게임 기록이 필요해지면 별도 데이터베이스 또는 유료 영속 디스크를 추가한다.
