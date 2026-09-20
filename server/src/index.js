import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import config from '../data/gameConfig.json' with { type: 'json' };
import { RoomManager } from './game/RoomManager.js';
import { GameEngine } from './game/GameEngine.js';
import { cleanText, id } from './utils.js';
import { createSabotajiPlatformBridge } from './platform-bridge.js';

const allowedOrigins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean) : true;
const corsOptions = { origin: allowedOrigins, credentials: true };
const app = express(); app.use(cors(corsOptions)); app.use(express.json({ limit: '10kb' }));
app.get('/api/health', (_, res) => res.json({ ok: true, now: Date.now(), uptimeSeconds: Math.floor(process.uptime()) }));
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 100_000, cors: corsOptions });
const rooms = new RoomManager(io);
const platformBridge = createSabotajiPlatformBridge(rooms, process.env.PUBLIC_APP_URL || 'https://sabotaji.onrender.com');
app.get('/api/records', (_, res) => res.json(rooms.records()));
app.get('/api/platform/rooms', (_, res) => res.json(platformBridge.publicState()));
// Keep this fallback after every API route so /api requests are never served
// with the React entry page.
if (fs.existsSync(clientDist)) {
  app.get('/{*path}', (_, res) => res.sendFile(path.join(clientDist, 'index.html')));
}
const safe = (socket, event, fn) => socket.on(event, async (payload = {}, ack = () => {}) => {
  try {
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('요청 형식이 올바르지 않습니다.');
    const now = Date.now(); socket.data.requestTimes = (socket.data.requestTimes || []).filter(time => now - time < 5_000);
    if (socket.data.requestTimes.length >= 40) throw new Error('요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.');
    socket.data.requestTimes.push(now);
    const result = await fn(payload); ack({ ok: true, ...result });
  } catch (error) { const message = error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.'; ack({ ok: false, error: message }); socket.emit('gameError', message); }
});
const verifyPlatformJoinToken = token => {
  const secret = process.env.PLATFORM_JOIN_SECRET;
  if (!secret) throw new Error('플랫폼 자동 입장이 아직 설정되지 않았습니다.');
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) throw new Error('자동 입장 정보가 올바르지 않습니다.');
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const received = Buffer.from(signature), valid = Buffer.from(expected);
  if (received.length !== valid.length || !timingSafeEqual(received, valid)) throw new Error('자동 입장 정보가 만료되었거나 올바르지 않습니다.');
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { throw new Error('자동 입장 정보를 읽을 수 없습니다.'); }
  if (payload.gameId !== 'sabotaji' || !payload.roomCode || !payload.nickname || Number(payload.exp) * 1000 <= Date.now()) throw new Error('자동 입장 정보가 만료되었거나 다른 게임용입니다.');
  return payload;
};

io.on('connection', socket => {
  safe(socket, 'listRooms', () => ({ rooms: rooms.listPublicRooms() }));
  safe(socket, 'getRecords', () => rooms.records());
  safe(socket, 'createRoom', input => { const { room, player } = rooms.create(socket, input); rooms.broadcast(room); return { roomCode:room.id, playerId:player.id, reconnectToken:player.reconnectToken }; });
  safe(socket, 'joinRoom', input => { const { room, player, isSpectator } = rooms.join(socket, input); room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님이 ${isSpectator?'관전자로 ':' '}입장했습니다.`, at:Date.now() }); rooms.broadcast(room); return { roomCode:room.id, playerId:player.id, reconnectToken:player.reconnectToken, isSpectator:Boolean(isSpectator) }; });
  safe(socket, 'platformJoin', ({ joinToken }) => { const payload = verifyPlatformJoinToken(joinToken); const { room, player, isSpectator } = rooms.join(socket, { roomCode:payload.roomCode, nickname:payload.nickname, asSpectator:payload.mode === 'SPECTATOR' }); room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님이 ${isSpectator?'관전자로 ':' '}플랫폼에서 입장했습니다.`, at:Date.now() }); rooms.broadcast(room); return { roomCode:room.id, playerId:player.id, reconnectToken:player.reconnectToken, isSpectator:Boolean(isSpectator) }; });
  safe(socket, 'reconnectRoom', input => { const { room, player, isSpectator } = rooms.reconnect(socket, input); rooms.broadcast(room); return { roomCode:room.id, playerId:player.id, reconnectToken:player.reconnectToken, isSpectator:Boolean(isSpectator) }; });
  safe(socket, 'leaveRoom', () => { rooms.leave(socket); return {}; });
  safe(socket, 'playerReady', () => { const { room, player } = rooms.context(socket); if (room.status !== 'LOBBY') throw new Error('로비에서만 준비할 수 있습니다.'); player.ready = !player.ready; rooms.broadcast(room); return {}; });
  safe(socket, 'startGame', () => { const { room, player } = rooms.context(socket); if (room.hostId !== player.id) throw new Error('방장만 시작할 수 있습니다.'); new GameEngine(room).start(); rooms.broadcast(room); return {}; });
  safe(socket, 'playPathCard', payload => { const { room, player } = rooms.context(socket); new GameEngine(room).playPath(player.id, payload); rooms.broadcast(room); return {}; });
  safe(socket, 'playActionCard', payload => { const { room, player } = rooms.context(socket); new GameEngine(room).playAction(player.id, payload); rooms.broadcast(room); return {}; });
  safe(socket, 'chooseGold', payload => { const { room, player } = rooms.context(socket); new GameEngine(room).chooseGold(player.id, payload.rewardId); rooms.broadcast(room); return {}; });
  safe(socket, 'nextRound', () => { const { room, player } = rooms.context(socket); if (room.hostId !== player.id) throw new Error('방장만 다음 라운드를 시작할 수 있습니다.'); new GameEngine(room).nextRound(); rooms.broadcast(room); return {}; });
  safe(socket, 'rematch', () => { const { room, player } = rooms.context(socket); if (room.hostId !== player.id) throw new Error('방장만 재경기를 시작할 수 있습니다.'); new GameEngine(room).rematch(); rooms.broadcast(room); return {}; });
  safe(socket, 'discardCard', payload => { const { room, player } = rooms.context(socket); new GameEngine(room).discard(player.id, payload.cardId); rooms.broadcast(room); return {}; });
  safe(socket, 'chatMessage', payload => { const { room, player } = rooms.chatContext(socket); const message = cleanText(payload.message, config.chatMaxLength); if (!message) throw new Error('메시지를 입력하세요.'); room.chat.push({ id:id(5), playerId:player.id, nickname:player.nickname, spectator:Boolean(player.isSpectator), message, at:Date.now() }); room.chat = room.chat.slice(-100); rooms.broadcast(room); return {}; });
  socket.on('disconnect', () => rooms.disconnect(socket));
});

const port = Number(process.env.PORT) || 3001;
server.listen(port, '0.0.0.0', () => console.log(`Sabotaji server: http://localhost:${port}`));
