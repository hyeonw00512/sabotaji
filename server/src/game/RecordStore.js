import fs from 'node:fs';
import path from 'node:path';
import { id } from '../utils.js';

export class RecordStore {
  constructor(filePath = process.env.GAME_HISTORY_PATH || path.resolve(process.cwd(), 'storage/game-history.json')) {
    this.filePath = filePath;
    this.records = this.load();
  }
  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed.records) ? parsed.records : [];
    } catch { return []; }
  }
  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive:true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ records:this.records.slice(-200) }, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
  recordGame(room) {
    const result = room.game?.result;
    if (!result) return null;
    const record = {
      id:id(8), roomCode:room.id, finishedAt:Date.now(), rounds:room.settings.rounds,
      winnerTeam:result.winnerTeam, reason:result.reason,
      players:result.roles.map(player => ({ nickname:player.nickname, roleName:player.roleName, team:player.team, score:player.score || 0 }))
    };
    this.records.push(record);
    this.records = this.records.slice(-200);
    this.save();
    return record;
  }
  summary() {
    const standings = new Map();
    for (const record of this.records) for (const player of record.players) {
      const current = standings.get(player.nickname) || { nickname:player.nickname, games:0, wins:0, score:0, lastPlayedAt:0 };
      current.games += 1;
      current.score += player.score;
      if (player.team === record.winnerTeam) current.wins += 1;
      current.lastPlayedAt = Math.max(current.lastPlayedAt, record.finishedAt);
      standings.set(player.nickname, current);
    }
    const leaderboard = [...standings.values()].sort((left, right) => right.score - left.score || right.wins - left.wins || right.lastPlayedAt - left.lastPlayedAt).slice(0, 20);
    return { totalGames:this.records.length, leaderboard, recentGames:[...this.records].reverse().slice(0, 10) };
  }
}
