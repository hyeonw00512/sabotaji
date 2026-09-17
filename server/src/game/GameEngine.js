import config from '../../data/gameConfig.json' with { type: 'json' };
import rolesData from '../../data/roles.json' with { type: 'json' };
import pathsData from '../../data/pathCards.json' with { type: 'json' };
import actionsData from '../../data/actionCards.json' with { type: 'json' };
import scoring from '../../data/scoring.json' with { type: 'json' };
import aiConfig from '../../data/aiConfig.json' with { type: 'json' };
import { BoardEngine, validatePathCardDefinitions } from './BoardEngine.js';
import { id, shuffle } from '../utils.js';

export const randomStartingTurnIndex = (players, random = Math.random) => {
  if (!players.length) return 0;
  return Math.min(players.length - 1, Math.floor(random() * players.length));
};

export class GameEngine {
  constructor(room) { this.room = room; this.boardEngine = new BoardEngine(config); }
  start() {
    const active = this.room.players.filter(p => p.connected || p.aiControlled);
    if (active.length < config.minPlayers) throw new Error(`최소 ${config.minPlayers}명이 필요합니다.`);
    if (!active.every(p => p.ready || p.id === this.room.hostId)) throw new Error('모든 참가자가 준비해야 합니다.');
    active.forEach(player => { player.score = 0; player.rewards = []; });
    this.room.match = { rewardDeck: shuffle(scoring.tokens.flatMap(token => Array.from({ length: token.count }, () => ({ id: id(6), value: token.value })))), awardedRewards: [] };
    this.startRound(1);
  }
  startRound(round) {
    const active = this.room.players.filter(p => p.connected || p.aiControlled);
    if (active.length < config.minPlayers) throw new Error(`최소 ${config.minPlayers}명이 필요합니다.`);
    const roleSetup = rolesData.distribution[String(active.length)];
    const shuffledRoles = shuffle(Object.entries(roleSetup.pool).flatMap(([role, count]) => Array(count).fill(role)));
    const dealtRoles = shuffledRoles.slice(0, roleSetup.dealCount);
    shuffle(active).forEach((player, index) => { player.forfeited = false; player.aiControlled = !player.connected; player.role = dealtRoles[index]; player.equipment = { PICK: true, CART: true, LAMP: true }; player.peekedGoals = []; player.hand = []; });
    validatePathCardDefinitions(pathsData.cards);
    const pathDeck = pathsData.cards.flatMap(def => Array.from({ length: def.count }, () => ({ id: id(6), type: 'PATH', ...def, count: undefined })));
    const actionDeck = this.room.settings.actionCards ? actionsData.cards.flatMap(def => Array.from({ length: def.count }, () => ({ id: id(6), ...def, count: undefined }))) : [];
    const deck = shuffle([...pathDeck, ...actionDeck]);
    const handSize = config.handSizes.find(r => active.length >= r.min && active.length <= r.max).size;
    active.forEach(player => { player.hand = deck.splice(0, handSize); });
    this.room.match ||= { rewardDeck: shuffle(scoring.tokens.flatMap(token => Array.from({ length: token.count }, () => ({ id: id(6), value: token.value })))), awardedRewards: [] };
    const goals = shuffle(['TREASURE', 'ROCK', 'ROCK']);
    const turnIndex = config.startingPlayerPolicy === 'RANDOM_EACH_ROUND' ? randomStartingTurnIndex(active) : 0;
    const startingPlayer = active[turnIndex];
    this.room.game = { phase: 'PLAYING', round, turnIndex, startingPlayerId: startingPlayer.id, deck, discardPile: [], board: this.boardEngine.initialBoard(), goals, unusedRoles: shuffledRoles.slice(roleSetup.dealCount), winner: null, result: null, turnStartedAt: Date.now() };
    this.room.status = 'PLAYING';
    this.log(round === 1 ? `게임을 시작했습니다. ${startingPlayer.nickname} 님이 무작위로 첫 차례가 되었습니다. 비밀 역할을 확인하세요.` : `${round}라운드를 시작했습니다. ${startingPlayer.nickname} 님이 무작위로 첫 차례가 되었습니다. 역할을 다시 확인하세요.`);
  }
  currentPlayer() { return this.activePlayers()[this.room.game.turnIndex % this.activePlayers().length]; }
  activePlayers() { return this.room.players.filter(p => !p.forfeited && (p.connected || p.aiControlled || p.hand?.length)); }
  assertTurn(playerId) {
    if (!this.room.game || this.room.game.phase !== 'PLAYING') throw new Error('게임 진행 중이 아닙니다.');
    if (this.currentPlayer()?.id !== playerId) throw new Error('현재 차례가 아닙니다.');
  }
  playPath(playerId, payload) {
    this.assertTurn(playerId);
    const player = this.room.players.find(p => p.id === playerId);
    const cardIndex = player.hand.findIndex(c => c.id === payload.cardId && c.type === 'PATH');
    if (cardIndex < 0) throw new Error('손패에 없는 카드입니다.');
    if (Object.values(player.equipment).some(value => !value)) throw new Error('장비가 고장나 길 카드를 사용할 수 없습니다.');
    const card = player.hand[cardIndex];
    const result = this.boardEngine.validatePlacement(this.room.game.board, card, payload.x, payload.y, payload.rotation);
    if (!result.ok) throw new Error(result.error);
    player.hand.splice(cardIndex, 1);
    this.room.game.board[`${payload.x},${payload.y}`] = { id: card.id, kind: 'PATH', cardKey: card.key, x: payload.x, y: payload.y, rotation: payload.rotation, connections: result.connections, routes: result.routes };
    const treasureFound = this.revealReachableGoals();
    this.log(`${player.nickname} 님이 터널 카드를 배치했습니다.`);
    if (treasureFound) this.endRound('MINERS', '진짜 광맥까지 터널을 연결했습니다.', player.id);
    else this.drawAndAdvance(player);
  }
  discard(playerId, cardId) {
    this.assertTurn(playerId);
    const player = this.room.players.find(p => p.id === playerId);
    const index = player.hand.findIndex(c => c.id === cardId);
    if (index < 0) throw new Error('손패에 없는 카드입니다.');
    this.room.game.discardPile.push(player.hand.splice(index, 1)[0]);
    this.log(`${player.nickname} 님이 카드를 버렸습니다.`);
    this.drawAndAdvance(player);
  }
  playAction(playerId, payload) {
    this.assertTurn(playerId);
    const player = this.room.players.find(p => p.id === playerId);
    const cardIndex = player.hand.findIndex(c => c.id === payload.cardId && c.type === 'ACTION');
    if (cardIndex < 0) throw new Error('손패에 없는 행동 카드입니다.');
    const card = player.hand[cardIndex];
    if (card.action === 'BREAK' || card.action === 'REPAIR') this.applyEquipmentAction(player, card, payload.targetPlayerId, payload.equipment);
    else if (card.action === 'REMOVE_PATH') this.removePath(player, payload);
    else if (card.action === 'PEEK_GOAL') this.peekGoal(player, payload.goalIndex);
    else throw new Error('지원하지 않는 행동 카드입니다.');
    this.room.game.discardPile.push(player.hand.splice(cardIndex, 1)[0]);
    this.drawAndAdvance(player);
  }
  applyEquipmentAction(player, card, targetPlayerId, selectedEquipment) {
    const target = this.room.players.find(p => p.id === targetPlayerId && (p.connected || p.aiControlled));
    if (!target) throw new Error('대상 플레이어를 찾을 수 없습니다.');
    const options = card.equipmentOptions || [card.equipment];
    const equipment = selectedEquipment || options.find(option => card.action === 'BREAK' ? target.equipment[option] : !target.equipment[option]) || options[0];
    if (!options.includes(equipment)) throw new Error('이 카드로 선택할 수 없는 장비입니다.');
    if (card.action === 'BREAK') {
      if (!target.equipment[equipment]) throw new Error('이미 고장난 장비입니다.');
      target.equipment[equipment] = false;
      this.log(`${player.nickname} 님이 ${target.nickname} 님의 장비 하나를 고장냈습니다.`);
    } else {
      if (target.equipment[equipment]) throw new Error('고장나지 않은 장비입니다.');
      target.equipment[equipment] = true;
      this.log(`${player.nickname} 님이 ${target.nickname} 님의 장비 하나를 수리했습니다.`);
    }
  }
  removePath(player, payload) {
    if (!Number.isInteger(payload.x) || !Number.isInteger(payload.y)) throw new Error('제거할 칸이 올바르지 않습니다.');
    const key = `${payload.x},${payload.y}`;
    const cell = this.room.game.board[key];
    if (!cell || cell.kind !== 'PATH') throw new Error('제거할 수 있는 터널 카드가 아닙니다.');
    delete this.room.game.board[key];
    this.log(`${player.nickname} 님이 터널 카드 한 장을 제거했습니다.`);
  }
  peekGoal(player, goalIndex) {
    if (!Number.isInteger(goalIndex) || goalIndex < 0 || goalIndex >= this.room.game.goals.length) throw new Error('확인할 목표가 올바르지 않습니다.');
    const goal = Object.values(this.room.game.board).find(cell => cell.kind === 'GOAL' && cell.goalIndex === goalIndex);
    if (!goal || goal.revealed) throw new Error('이미 공개되었거나 존재하지 않는 목표입니다.');
    if (!player.peekedGoals.some(item => item.goalIndex === goalIndex)) player.peekedGoals.push({ goalIndex, goalType: this.room.game.goals[goalIndex] });
    this.log(`${player.nickname} 님이 목표 카드 하나를 확인했습니다.`);
  }
  drawAndAdvance(player) {
    const drawn = this.room.game.deck.shift();
    if (drawn) player.hand.push(drawn);
    const players = this.activePlayers();
    let next = this.room.game.turnIndex;
    for (let i = 0; i < players.length; i++) { next = (next + 1) % players.length; if (players[next].connected || players[next].aiControlled) break; }
    this.room.game.turnIndex = next;
    this.room.game.turnStartedAt = Date.now();
    this.checkDeckExhaustion(player.id);
  }
  checkDeckExhaustion(triggerPlayerId) {
    const players = this.activePlayers();
    if (!this.room.game.deck.length && players.every(current => current.hand.length === 0)) this.endRound('SABOTEURS', '덱과 모든 손패가 소진될 때까지 광맥을 찾지 못했습니다.', triggerPlayerId);
  }
  revealReachableGoals() {
    let treasureFound = false;
    for (const key of this.boardEngine.reachableGoalKeys(this.room.game.board)) {
      const target = this.room.game.board[key];
      if (target?.kind === 'GOAL' && !target.revealed) { target.revealed = true; target.goalType = this.room.game.goals[target.goalIndex]; treasureFound ||= target.goalType === 'TREASURE'; this.log('목표 지점 하나가 공개되었습니다.'); }
    }
    return treasureFound;
  }
  rewardOrder(winners, triggerPlayerId) {
    const players = this.activePlayers();
    const triggerIndex = Math.max(0, players.findIndex(player => player.id === triggerPlayerId));
    return Array.from({ length: players.length }, (_, offset) => players[(triggerIndex + offset) % players.length]).filter(player => winners.some(winner => winner.id === player.id));
  }
  awardWinners(winners, winnerTeam, triggerPlayerId) {
    if (!winners.length) return [];
    const rule = scoring.awards[winnerTeam];
    const goldValue = rule.goldValueByWinnerCount?.[String(winners.length)];
    const total = goldValue ? winners.length : winners.length * rule.perWinner + (rule.extraByWinnerCount[String(winners.length)] || 0);
    const awards = [];
    const ordered = this.rewardOrder(winners, triggerPlayerId);
    if (goldValue) {
      for (const recipient of ordered) this.grantGoldCards(recipient, this.takeGoldCardsOfValue(goldValue), awards);
      return awards;
    }
    for (let index = 0; index < total; index++) {
      const token = this.room.match.rewardDeck.shift();
      if (!token) break;
      this.grantGoldCards(ordered[index % ordered.length], [token], awards);
    }
    return awards;
  }
  takeGoldCardsOfValue(value) {
    const deck = this.room.match.rewardDeck;
    const find = (start, remaining, indexes) => {
      if (remaining === 0) return indexes;
      for (let index = start; index < deck.length; index++) if (deck[index].value <= remaining) {
        const found = find(index + 1, remaining - deck[index].value, [...indexes, index]);
        if (found) return found;
      }
      return null;
    };
    const indexes = find(0, value, []);
    if (!indexes) throw new Error(`금 조각 덱에서 ${value}광석 보상을 만들 수 없습니다.`);
    return indexes.reverse().map(index => deck.splice(index, 1)[0]);
  }
  grantGoldCards(recipient, tokens, awards) {
    for (const token of tokens) {
      const award = { ...token, round: this.room.game.round };
      recipient.rewards ||= []; recipient.rewards.push(award); recipient.score = (recipient.score || 0) + award.value;
      this.room.match.awardedRewards.push({ playerId: recipient.id, ...award });
      awards.push({ playerId: recipient.id, value: award.value });
    }
  }
  goldDraftOrder(winners, triggerPlayerId) {
    const players = this.activePlayers();
    const triggerIndex = Math.max(0, players.findIndex(player => player.id === triggerPlayerId));
    return Array.from({ length: players.length }, (_, offset) => players[(triggerIndex - offset + players.length) % players.length]).filter(player => winners.some(winner => winner.id === player.id));
  }
  beginGoldDraft(reason, triggerPlayerId) {
    const winners = this.room.players.filter(player => !player.forfeited && rolesData.roles[player.role]?.team === 'MINERS');
    const order = this.goldDraftOrder(winners, triggerPlayerId);
    const options = this.room.match.rewardDeck.splice(0, order.length);
    if (!order.length || options.length < order.length) return this.finishRound('MINERS', reason, []);
    this.room.game.phase = 'GOLD_DRAFT';
    this.room.game.winner = 'MINERS';
    this.room.game.goldDraft = { reason, order: order.map(player => player.id), index: 0, options, awards: [] };
    this.room.status = 'GOLD_DRAFT';
    this.log(`${order[0].nickname} 님이 금 조각 하나를 선택합니다.`);
  }
  chooseGold(playerId, rewardId) {
    if (this.room.game?.phase !== 'GOLD_DRAFT') throw new Error('금 조각을 고를 수 있는 상태가 아닙니다.');
    const draft = this.room.game.goldDraft;
    if (draft.order[draft.index] !== playerId) throw new Error('현재 금 조각을 고를 차례가 아닙니다.');
    const optionIndex = draft.options.findIndex(option => option.id === rewardId);
    if (optionIndex < 0) throw new Error('선택할 수 없는 금 조각입니다.');
    const player = this.room.players.find(current => current.id === playerId);
    const reward = { ...draft.options.splice(optionIndex, 1)[0], round: this.room.game.round };
    player.rewards ||= []; player.rewards.push(reward); player.score = (player.score || 0) + reward.value;
    this.room.match.awardedRewards.push({ playerId, ...reward }); draft.awards.push({ playerId, value: reward.value });
    draft.index += 1;
    if (draft.index >= draft.order.length) this.finishRound('MINERS', draft.reason, draft.awards);
    else this.log(`${this.room.players.find(current => current.id === draft.order[draft.index]).nickname} 님이 금 조각 하나를 선택합니다.`);
  }
  finishRound(winnerTeam, reason, awards) {
    const winners = this.room.players.filter(player => !player.forfeited && rolesData.roles[player.role]?.team === winnerTeam);
    const roles = this.room.players.map(player => {
      const team = rolesData.roles[player.role]?.team;
      const roundRewards = awards.filter(award => award.playerId === player.id).map(award => award.value);
      return { id: player.id, nickname: player.nickname, role: player.role, roleName: rolesData.roles[player.role]?.name, team, score: player.score || 0, roundRewards };
    });
    const isLastRound = this.room.game.round >= this.room.settings.rounds;
    this.room.game.phase = isLastRound ? 'GAME_END' : 'ROUND_END';
    this.room.game.winner = winnerTeam;
    const finalRanking = isLastRound ? [...roles].sort((left, right) => right.score - left.score || left.nickname.localeCompare(right.nickname, 'ko')) : null;
    const champions = finalRanking ? finalRanking.filter(player => player.score === finalRanking[0]?.score) : null;
    this.room.game.result = { winnerTeam, reason, tokenLabel: scoring.tokenLabel, awards, roles, unusedRoles: this.room.game.unusedRoles.map(role => ({ role, roleName: rolesData.roles[role]?.name })), finalRanking, champions };
    this.room.status = this.room.game.phase;
    this.log(`${winnerTeam === 'MINERS' ? '탐사대' : '교란자'} 팀이 이번 라운드에서 승리했습니다.`);
  }
  endRound(winnerTeam, reason, triggerPlayerId) {
    if (this.room.game.phase !== 'PLAYING') return;
    if (winnerTeam === 'MINERS') return this.beginGoldDraft(reason, triggerPlayerId);
    const winners = this.room.players.filter(player => !player.forfeited && rolesData.roles[player.role]?.team === winnerTeam);
    this.finishRound(winnerTeam, reason, this.awardWinners(winners, winnerTeam, triggerPlayerId));
  }
  nextRound() {
    if (this.room.game?.phase !== 'ROUND_END') throw new Error('다음 라운드를 시작할 수 없는 상태입니다.');
    this.startRound(this.room.game.round + 1);
  }
  rematch() {
    if (this.room.game?.phase !== 'GAME_END') throw new Error('게임이 끝난 뒤에만 재경기를 할 수 있습니다.');
    this.room.status = 'LOBBY';
    this.room.players.forEach(player => { player.ready = player.id === this.room.hostId; player.role = null; player.hand = []; player.peekedGoals = []; player.equipment = { PICK: true, CART: true, LAMP: true }; player.score = 0; player.rewards = []; player.forfeited = false; player.aiControlled = false; });
    this.room.game = null; this.room.match = null;
    this.log('재경기 대기실로 돌아왔습니다.');
  }
  autoDiscard(playerId) { try { const p = this.room.players.find(x => x.id === playerId); if (p?.hand.length) this.discard(playerId, p.hand[Math.floor(Math.random() * p.hand.length)].id); else this.skipDisconnectedTurn(playerId); } catch {} }
  skipDisconnectedTurn(playerId) {
    this.assertTurn(playerId);
    const player = this.room.players.find(current => current.id === playerId);
    if (!player || player.connected) throw new Error('연결된 플레이어의 차례는 건너뛸 수 없습니다.');
    this.log(`${player.nickname} 님의 재접속을 기다려 차례를 넘겼습니다.`);
    this.drawAndAdvance(player);
  }
  playAiTurn(playerId) {
    this.assertTurn(playerId);
    const player = this.room.players.find(current => current.id === playerId);
    if (!player?.aiControlled) throw new Error('AI 대체 플레이어가 아닙니다.');
    const policy = aiConfig.roles[player.role] || aiConfig.roles.MINER;
    const actionCard = this.chooseAiAction(player, policy);
    if (actionCard) {
      this.playAction(player.id, actionCard.payload);
      return;
    }
    const pathMove = this.chooseAiPath(player, policy.pathWeights);
    if (pathMove) {
      this.playPath(player.id, pathMove);
      return;
    }
    if (player.hand.length) this.discard(player.id, player.hand[0].id);
    else this.drawAndAdvance(player);
  }
  turnOrderedTargets(player, includeSelf = false) {
    const players = this.activePlayers();
    const index = players.findIndex(item => item.id === player.id);
    if (index < 0) return [];
    const ordered = Array.from({ length: players.length - 1 }, (_, offset) => players[(index + offset + 1) % players.length]);
    return includeSelf ? [player, ...ordered] : ordered;
  }
  publicProgress(board) {
    const reachable = this.boardEngine.reachableKeys(board);
    const cells = [...reachable].map(key => board[key]).filter(Boolean);
    return {
      frontierX: Math.max(...cells.map(cell => cell.x)),
      reachableCells: cells.filter(cell => cell.kind !== 'GOAL').length,
      revealedGoals: cells.filter(cell => cell.kind === 'GOAL').length
    };
  }
  scoreAiBoard(board, weights = {}) {
    const progress = this.publicProgress(board);
    return Object.entries(progress).reduce((score, [key, value]) => score + value * (weights[key] || 0), 0);
  }
  chooseAiAction(player, policy = {}) {
    for (const action of policy.actionOrder || []) {
      const card = player.hand.find(item => item.type === 'ACTION' && item.action === action);
      if (!card) continue;
      if (action === 'BREAK') {
        const target = this.turnOrderedTargets(player).find(item => item.equipment[card.equipment]);
        if (target) return { payload:{ cardId:card.id, targetPlayerId:target.id } };
      } else if (action === 'REPAIR') {
        const target = this.turnOrderedTargets(player, policy.repairTarget === 'SELF_THEN_NEXT').find(item => (card.equipmentOptions || [card.equipment]).some(equipment => !item.equipment[equipment]));
        const equipment = target && (card.equipmentOptions || [card.equipment]).find(option => !target.equipment[option]);
        if (target) return { payload:{ cardId:card.id, targetPlayerId:target.id, equipment } };
      } else if (action === 'REMOVE_PATH') {
        const targets = Object.values(this.room.game.board).filter(cell => cell.kind === 'PATH');
        const target = targets.map(cell => {
          const projected = { ...this.room.game.board };
          delete projected[`${cell.x},${cell.y}`];
          return { cell, score: this.scoreAiBoard(projected, policy.pathWeights) };
        }).sort((left, right) => right.score - left.score || left.cell.x - right.cell.x || left.cell.y - right.cell.y)[0]?.cell;
        if (target) return { payload:{ cardId:card.id, x:target.x, y:target.y } };
      } else if (action === 'PEEK_GOAL') {
        const goal = Object.values(this.room.game.board).find(cell => cell.kind === 'GOAL' && !cell.revealed && !player.peekedGoals.some(item => item.goalIndex === cell.goalIndex));
        if (goal) return { payload:{ cardId:card.id, goalIndex:goal.goalIndex } };
      }
    }
    return null;
  }
  chooseAiPath(player, weights) {
    const moves = [];
    const bounds = this.boardEngine.placementSearchBounds(this.room.game.board);
    for (const card of player.hand.filter(item => item.type === 'PATH')) {
      for (const rotation of card.rotatable ? [0, 180] : [0]) {
        for (let x = bounds.minX; x <= bounds.maxX; x++) for (let y = bounds.minY; y <= bounds.maxY; y++) {
          const validation = this.boardEngine.validatePlacement(this.room.game.board, card, x, y, rotation);
          if (!validation.ok) continue;
          const projected = { ...this.room.game.board, [`${x},${y}`]: { kind: 'PATH', x, y, connections: validation.connections, routes: validation.routes } };
          moves.push({ cardId:card.id, x, y, rotation, score: this.scoreAiBoard(projected, weights) });
        }
      }
    }
    if (!moves.length) return null;
    moves.sort((left, right) => right.score - left.score || right.x - left.x || left.y - right.y || left.rotation - right.rotation);
    return moves[0];
  }
  log(message) { this.room.logs.push({ id: id(5), type: 'SYSTEM', message, at: Date.now() }); this.room.logs = this.room.logs.slice(-100); }
}
