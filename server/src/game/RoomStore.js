import fs from 'node:fs';
import path from 'node:path';

export class RoomStore {
  constructor(filePath = process.env.ROOM_STATE_PATH || path.resolve(process.cwd(), 'storage/room-state.json'), retentionMs) {
    this.filePath = filePath;
    this.retentionMs = retentionMs;
  }
  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
      const cutoff = Date.now() - this.retentionMs;
      return rooms.filter(room => room && typeof room.id === 'string' && Array.isArray(room.players) && Number(room.updatedAt || 0) >= cutoff);
    } catch { return []; }
  }
  save(rooms) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ rooms }, null, 2), 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
  }
}
