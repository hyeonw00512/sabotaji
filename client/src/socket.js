import { io } from 'socket.io-client';
export const socket = io({ autoConnect:true, transports:['websocket','polling'] });
const ACK_TIMEOUT_MS = 10_000;
export const emitAck = (event, payload = {}) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('서버 응답 시간이 초과되었습니다. 연결 상태를 확인하세요.')), ACK_TIMEOUT_MS);
  socket.emit(event, payload, response => {
    clearTimeout(timeout);
    response?.ok ? resolve(response) : reject(new Error(response?.error || '요청에 실패했습니다.'));
  });
});
