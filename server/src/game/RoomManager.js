import config from '../../data/gameConfig.json' with { type: 'json' };
import crypto from 'node:crypto';
import roles from '../../data/roles.json' with { type: 'json' };
import aiConfig from '../../data/aiConfig.json' with { type: 'json' };
import { GameEngine } from './GameEngine.js';
import { RecordStore } from './RecordStore.js';
import { RoomStore } from './RoomStore.js';
import { cleanText, id, roomCode } from '../utils.js';

export class RoomManager {
  constructor(io, recordStore = new RecordStore(), roomStore = new RoomStore(undefined, config.roomStateRetentionMs)) {
    this.io = io; this.recordStore = recordStore; this.roomStore = roomStore; this.rooms = new Map(); this.socketPlayers = new Map(); this.timers = new Map(); this.disconnectTimers = new Map();
    this.restoreRooms();
  }
  restoreRooms() {
    for (const room of this.roomStore.load()) {
      room.spectators ||= []; room.chat ||= []; room.logs ||= [];
      for (const participant of [...room.players, ...room.spectators]) { participant.connected = false; participant.socketId = null; participant.disconnectedAt = Date.now(); }
      this.rooms.set(room.id, room);
    }
  }
  persist() { this.roomStore.save([...this.rooms.values()]); }
  create(socket, input = {}) {
    const player = this.newPlayer(socket, input.nickname);
    let code; do code = roomCode(); while (this.rooms.has(code));
    const settings = this.settings(input.settings);
    const passwordHash = this.hashPassword(input.password);
    const room = { id: code, hostId: player.id, status: 'LOBBY', settings, passwordHash, players: [player], spectators: [], game: null, chat: [], logs: [], updatedAt: Date.now() };
    this.rooms.set(code, room); this.attach(socket, room, player); return { room, player };
  }
  join(socket, input = {}) {
    const room = this.rooms.get(String(input.roomCode || '').toUpperCase());
    if (!room) throw new Error('존재하지 않는 방입니다.');
    if (room.passwordHash && !this.matchesPassword(input.password, room.passwordHash)) throw new Error('방 비밀번호가 올바르지 않습니다.');
    if (input.asSpectator) return this.joinSpectator(socket, room, input.nickname);
    if (room.status !== 'LOBBY') throw new Error('이미 게임이 시작된 방입니다. 관전으로 입장할 수 있습니다.');
    if (room.players.length >= room.settings.maxPlayers) throw new Error('방이 가득 찼습니다.');
    const player = this.newPlayer(socket, input.nickname); room.players.push(player); this.attach(socket, room, player); return { room, player };
  }
  joinSpectator(socket, room, nickname) {
    if (room.spectators.length >= config.maxSpectators) throw new Error('관전자 수가 가득 찼습니다.');
    const spectator = this.newSpectator(socket, nickname); room.spectators.push(spectator); this.attach(socket, room, spectator, 'SPECTATOR'); return { room, player: spectator, isSpectator: true };
  }
  reconnect(socket, input = {}) {
    const room = this.rooms.get(String(input.roomCode || '').toUpperCase());
    const player = room?.players.find(p => p.reconnectToken === input.reconnectToken);
    const spectator = room?.spectators.find(item => item.reconnectToken === input.reconnectToken);
    if (!room || (!player && !spectator)) throw new Error('복구할 참가 정보를 찾지 못했습니다.');
    if (spectator) { spectator.connected = true; spectator.disconnectedAt = null; this.attach(socket, room, spectator, 'SPECTATOR'); room.logs.push({ id:id(5), type:'SYSTEM', message:`${spectator.nickname} 님이 관전자로 재접속했습니다.`, at:Date.now() }); return { room, player:spectator, isSpectator:true }; }
    if (player.forfeited && room.status === 'PLAYING') throw new Error('장기 이탈 처리된 참가자는 이 라운드에 재접속할 수 없습니다.');
    clearTimeout(this.disconnectTimers.get(this.disconnectKey(room, player))); this.disconnectTimers.delete(this.disconnectKey(room, player));
    player.connected = true; player.disconnectedAt = null; if (room.status !== 'PLAYING') { player.forfeited = false; player.aiControlled = false; } this.attach(socket, room, player); room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님이 ${player.aiControlled ? 'AI 대행 상태로 ' : ''}재접속했습니다.`, at:Date.now() }); return { room, player };
  }
  newPlayer(socket, nickname) {
    const name = cleanText(nickname, 20);
    if (name.length < 1) throw new Error('닉네임을 입력하세요.');
    return { id: id(), reconnectToken: id(24), socketId: socket.id, nickname: name, connected: true, ready: false, role: null, hand: [], equipment: { PICK: true, CART: true, LAMP: true }, peekedGoals: [], peekReveal: null, score: 0, forfeited: false, aiControlled: false };
  }
  newSpectator(socket, nickname) {
    const name = cleanText(nickname, 20);
    if (name.length < 1) throw new Error('닉네임을 입력하세요.');
    return { id:id(), reconnectToken:id(24), socketId:socket.id, nickname:name, connected:true, isSpectator:true };
  }
  settings(input = {}) {
    const d = config.roomDefaults;
    if (input.specialRules) throw new Error('특수 규칙은 아직 구현되지 않았습니다. 기본 규칙으로 방을 만들어 주세요.');
    return { maxPlayers: Math.min(config.maxPlayers, Math.max(config.minPlayers, Number(input.maxPlayers) || d.maxPlayers)), rounds: [1,3,5].includes(Number(input.rounds)) ? Number(input.rounds) : d.rounds, turnSeconds: [0,30,45,60,90].includes(Number(input.turnSeconds)) ? Number(input.turnSeconds) : d.turnSeconds, isPublic: input.isPublic !== false, actionCards: input.actionCards !== false, specialRules: Boolean(input.specialRules), aiReplacement: input.aiReplacement !== false };
  }
  hashPassword(value) {
    const password = cleanText(value, 50);
    if (!password) return null;
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = crypto.scryptSync(password, salt, 32).toString('hex');
    return `${salt}:${digest}`;
  }
  matchesPassword(value, savedHash) {
    const password = cleanText(value, 50); if (!password || !savedHash) return false;
    const [salt, digest] = savedHash.split(':'); const actual = crypto.scryptSync(password, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(digest, 'hex'));
  }
  listPublicRooms() {
    return [...this.rooms.values()].filter(room => room.settings.isPublic).map(room => ({ roomCode:room.id, hostNickname:room.players.find(player => player.id === room.hostId)?.nickname || '알 수 없음', playerCount:room.players.length, maxPlayers:room.settings.maxPlayers, spectatorCount:room.spectators.length, status:room.status, rounds:room.settings.rounds, turnSeconds:room.settings.turnSeconds, requiresPassword:Boolean(room.passwordHash) }));
  }
  attach(socket, room, participant, type = 'PLAYER') { if (participant.socketId && participant.socketId !== socket.id) this.socketPlayers.delete(participant.socketId); participant.socketId = socket.id; socket.join(room.id); this.socketPlayers.set(socket.id, { roomId: room.id, playerId: participant.id, type }); }
  context(socket) { const link = this.socketPlayers.get(socket.id); const room = link && this.rooms.get(link.roomId); const player = room?.players.find(p => p.id === link.playerId); if (!room || !player || link.type === 'SPECTATOR') throw new Error('관전자는 게임 행동을 할 수 없습니다.'); if (player.aiControlled && room.status === 'PLAYING') throw new Error('AI가 이번 게임을 대행 중입니다. 다음 라운드부터 직접 플레이할 수 있습니다.'); return { room, player }; }
  chatContext(socket) { const link = this.socketPlayers.get(socket.id); const room = link && this.rooms.get(link.roomId); const participant = link?.type === 'SPECTATOR' ? room?.spectators.find(item => item.id === link.playerId) : room?.players.find(item => item.id === link.playerId); if (!room || !participant) throw new Error('방에 참가하지 않았습니다.'); return { room, player:participant }; }
  publicState(room) {
    const game = room.game;
    const boardEngine = new GameEngine(room).boardEngine;
    return { roomCode: room.id, hostId: room.hostId, status: room.status, settings: room.settings, players: room.players.map(p => ({ id:p.id, nickname:p.nickname, connected:p.connected, connectionState:p.forfeited?'LEFT':p.aiControlled?'AI':p.connected?'CONNECTED':'RECONNECTING', ready:p.ready, cardCount:p.hand.length, equipment:p.equipment, score:p.score || 0 })), spectators:(room.spectators || []).map(item => ({ id:item.id, nickname:item.nickname, connected:item.connected })), chat: room.chat.slice(-100), logs: room.logs.slice(-100), game: game ? { phase:game.phase, round:game.round, roleRevealId:game.roleRevealId, goalReveal:game.goalReveal || null, lastAction:game.lastAction || null, turnPlayerId:game.phase === 'PLAYING' ? new GameEngine(room).currentPlayer()?.id : null, rewardPlayerId:game.phase === 'GOLD_DRAFT' ? game.goldDraft.order[game.goldDraft.index] : null, deckCount:game.deck.length, discardCount:game.discardPile.length, boardBounds:boardEngine.viewBounds(game.board), board:Object.values(game.board).map(cell => cell.kind === 'GOAL' && !cell.revealed ? { kind:'GOAL', x:cell.x, y:cell.y, goalIndex:cell.goalIndex, revealed:false } : cell), result:['PLAYING','GOLD_DRAFT'].includes(game.phase) ? null : game.result, turnStartedAt:game.turnStartedAt } : null };
  }
  privateState(roomOrPlayer, maybePlayer) {
    const room = maybePlayer ? roomOrPlayer : null;
    const player = maybePlayer || roomOrPlayer;
    const draft = room?.game?.phase === 'GOLD_DRAFT' && room.game.goldDraft.order[room.game.goldDraft.index] === player.id ? { options: room.game.goldDraft.options.map(option => ({ id:option.id, value:option.value })) } : null;
    return { playerId:player.id, reconnectToken:player.reconnectToken, role: player.role ? roles.roles[player.role] : null, roleRevealId:room?.game?.roleRevealId || null, hand:player.hand, peekedGoals:player.peekedGoals, peekReveal:player.peekReveal || null, aiControlled:Boolean(player.aiControlled), goldDraft:draft };
  }
  records() { return this.recordStore.summary(); }
  broadcast(room) { if (room.game?.phase === 'GAME_END' && !room.game.recordedAt) { this.recordStore.recordGame(room); room.game.recordedAt = Date.now(); } room.updatedAt = Date.now(); this.persist(); this.io.to(room.id).emit('gameState', this.publicState(room)); for (const p of room.players) if (p.connected) this.io.to(p.socketId).emit('privateState', this.privateState(room, p)); this.io.emit('roomList', this.listPublicRooms()); this.scheduleTimer(room); }
  scheduleTimer(room) {
    clearTimeout(this.timers.get(room.id));
    if (room.status === 'GOLD_DRAFT') {
      const draft = room.game.goldDraft; const playerId = draft.order[draft.index];
      const player = room.players.find(item => item.id === playerId);
      const delay = player?.aiControlled ? aiConfig.turnDelayMs : config.rewardChoiceSeconds * 1000;
      this.timers.set(room.id, setTimeout(() => { try { const options = room.game?.goldDraft?.options; if (options?.length) new GameEngine(room).chooseGold(playerId, player?.aiControlled ? [...options].sort((left, right) => right.value - left.value)[0].id : options[0].id); } finally { this.broadcast(room); } }, delay));
      return;
    }
    if (room.status !== 'PLAYING') return;
    const engine = new GameEngine(room); const playerId = engine.currentPlayer()?.id;
    const player = room.players.find(item => item.id === playerId);
    if (player?.aiControlled) { this.timers.set(room.id, setTimeout(() => { try { new GameEngine(room).playAiTurn(playerId); } finally { this.broadcast(room); } }, aiConfig.turnDelayMs)); return; }
    if (!room.settings.turnSeconds) return;
    this.timers.set(room.id, setTimeout(() => { engine.autoDiscard(playerId); this.broadcast(room); }, room.settings.turnSeconds * 1000));
  }
  disconnect(socket) {
    const link = this.socketPlayers.get(socket.id); this.socketPlayers.delete(socket.id); if (!link) return;
    const room = this.rooms.get(link.roomId); if (!room) return;
    if (link.type === 'SPECTATOR') { const spectator = room.spectators.find(item => item.id === link.playerId); if (!spectator) return; spectator.connected = false; spectator.disconnectedAt = Date.now(); setTimeout(() => { if (!spectator.connected && Date.now() - spectator.disconnectedAt >= config.reconnectGraceMs) { room.spectators = room.spectators.filter(item => item.id !== spectator.id); this.broadcast(room); } }, config.reconnectGraceMs + 100); this.broadcast(room); return; }
    const player = room.players.find(p => p.id === link.playerId); if (!player) return;
    player.connected = false; player.disconnectedAt = Date.now(); room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님이 재접속 대기 상태입니다.`, at:Date.now() });
    if (room.hostId === player.id) room.hostId = room.players.find(p => p.connected)?.id || player.id;
    this.broadcast(room);
    if (room.status === 'PLAYING' && !player.aiControlled && new GameEngine(room).currentPlayer()?.id === player.id) this.scheduleDisconnectedTurn(room, player);
    setTimeout(() => this.expireDisconnectedPlayer(room, player), config.reconnectGraceMs + 100);
  }
  disconnectKey(room, player) { return `${room.id}:${player.id}`; }
  scheduleDisconnectedTurn(room, player) {
    const key = this.disconnectKey(room, player); clearTimeout(this.disconnectTimers.get(key));
    this.disconnectTimers.set(key, setTimeout(() => { if (!player.connected && !player.forfeited && room.status === 'PLAYING' && new GameEngine(room).currentPlayer()?.id === player.id) { new GameEngine(room).autoDiscard(player.id); this.broadcast(room); } }, config.disconnectTurnGraceMs));
  }
  expireDisconnectedPlayer(room, player) {
    if (player.connected || player.forfeited || player.aiControlled || Date.now() - player.disconnectedAt < config.reconnectGraceMs) return;
    if (room.status === 'LOBBY') { room.players = room.players.filter(current => current.id !== player.id); if (!room.players.length) { this.rooms.delete(room.id); this.persist(); } else this.broadcast(room); return; }
    if (room.status === 'PLAYING' && room.settings.aiReplacement) {
      player.aiControlled = true;
      room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님의 장기 이탈로 AI가 이번 게임을 대행합니다.`, at:Date.now() });
      this.broadcast(room);
      return;
    }
    if (room.status === 'PLAYING') {
      player.forfeited = true;
      room.game.discardPile.push(...player.hand); player.hand = [];
      room.logs.push({ id:id(5), type:'SYSTEM', message:`${player.nickname} 님이 장기 이탈로 이번 라운드에서 제외되었습니다.`, at:Date.now() });
      const engine = new GameEngine(room); if (engine.currentPlayer()?.id === player.id) engine.skipDisconnectedTurn(player.id);
      engine.checkDeckExhaustion();
      this.broadcast(room);
    }
  }
}
