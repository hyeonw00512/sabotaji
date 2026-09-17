const DIRECTIONS = {
  TOP: { dx: 0, dy: -1, opposite: 'BOTTOM' }, RIGHT: { dx: 1, dy: 0, opposite: 'LEFT' },
  BOTTOM: { dx: 0, dy: 1, opposite: 'TOP' }, LEFT: { dx: -1, dy: 0, opposite: 'RIGHT' }
};
const keyOf = (x, y) => `${x},${y}`;
const routeKey = (key, index) => `${key}#${index}`;
const DIRECTION_NAMES = Object.keys(DIRECTIONS);

export function rotateConnections(base, rotation) {
  const order = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
  const steps = ((rotation % 360) + 360) % 360 / 90;
  return base.map(direction => order[(order.indexOf(direction) + steps) % 4]);
}

export const rotateRoutes = (routes, rotation) => routes.map(route => rotateConnections(route, rotation));
export const connectionsOfRoutes = routes => [...new Set(routes.flat())];
export function validatePathCardDefinitions(cards) {
  if (!Array.isArray(cards) || !cards.length) throw new Error('길 카드 데이터가 비어 있습니다.');
  for (const card of cards) {
    if (!card.key || !Number.isInteger(card.count) || card.count < 1 || typeof card.rotatable !== 'boolean') throw new Error(`길 카드 정의가 올바르지 않습니다: ${card.key || '이름 없음'}`);
    if (!Array.isArray(card.routes) || !card.routes.length) throw new Error(`길 카드 통로 데이터가 없습니다: ${card.key}`);
    const ends = card.routes.flat();
    if (ends.some(direction => !DIRECTION_NAMES.includes(direction)) || new Set(ends).size !== ends.length) throw new Error(`길 카드 통로 방향이 중복되었거나 올바르지 않습니다: ${card.key}`);
    const derived = connectionsOfRoutes(card.routes).sort();
    const declared = [...(card.connections || [])].sort();
    if (derived.join(',') !== declared.join(',')) throw new Error(`길 카드 연결 방향이 통로와 일치하지 않습니다: ${card.key}`);
  }
}
const routesOf = cell => cell.routes || (cell.connections ? [cell.connections] : []);
const routeIndexesWith = (cell, direction) => routesOf(cell).flatMap((route, index) => route.includes(direction) ? [index] : []);

export class BoardEngine {
  constructor(config) { this.config = config.board; }
  configuredBounds() {
    return this.config.initialBounds || {
      minX: this.config.minX, maxX: this.config.maxX,
      minY: this.config.minY, maxY: this.config.maxY
    };
  }
  viewBounds(board, padding = 1) {
    const configured = this.configuredBounds();
    const cells = Object.values(board);
    return {
      minX: Math.min(configured.minX, ...cells.map(cell => cell.x)) - padding,
      maxX: Math.max(configured.maxX, ...cells.map(cell => cell.x)) + padding,
      minY: Math.min(configured.minY, ...cells.map(cell => cell.y)) - padding,
      maxY: Math.max(configured.maxY, ...cells.map(cell => cell.y)) + padding
    };
  }
  placementSearchBounds(board) { return this.viewBounds(board, 1); }
  initialBoard() {
    const startConnections = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
    const board = { [keyOf(this.config.start.x, this.config.start.y)]: { kind: 'START', ...this.config.start, connections: startConnections, routes: [startConnections] } };
    this.config.goals.forEach((goal, index) => { board[keyOf(goal.x, goal.y)] = { kind: 'GOAL', ...goal, goalIndex: index, revealed: false }; });
    return board;
  }
  validatePlacement(board, card, x, y, rotation) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: '칸 좌표가 올바르지 않습니다.' };
    const bounds = this.configuredBounds();
    if (!this.config.allowExpansion && (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY)) return { ok: false, error: '보드 범위를 벗어났습니다.' };
    if (board[keyOf(x, y)]) return { ok: false, error: '이미 카드가 있는 칸입니다.' };
    if (![0, 180].includes(rotation) || (!card.rotatable && rotation !== 0)) return { ok: false, error: '허용되지 않은 회전입니다.' };
    const routes = rotateRoutes(card.routes || [card.connections], rotation);
    const connections = connectionsOfRoutes(routes);
    let adjacent = 0;
    let connectedToReachable = false;
    const reachableRoutes = this.reachableRouteKeys(board);
    for (const [direction, delta] of Object.entries(DIRECTIONS)) {
      const neighborKey = keyOf(x + delta.dx, y + delta.dy);
      const neighbor = board[neighborKey];
      if (!neighbor) continue;
      adjacent++;
      // 목표 카드는 공개 전후 모두 인접 면의 길 모양 불일치를 허용한다.
      // 다만 목표 카드를 경유해 다른 길로 이어지는 통로로는 취급하지 않는다.
      if (neighbor.kind === 'GOAL') continue;
      const mineOpen = connections.includes(direction);
      const neighborOpen = (neighbor.connections || []).includes(delta.opposite);
      if (mineOpen !== neighborOpen) return { ok: false, error: '터널과 벽이 맞닿습니다.' };
      if (mineOpen && routeIndexesWith(neighbor, delta.opposite).some(index => reachableRoutes.has(routeKey(neighborKey, index)))) connectedToReachable = true;
    }
    if (!adjacent) return { ok: false, error: '기존 카드와 인접해야 합니다.' };
    if (!connectedToReachable) return { ok: false, error: '시작점과 연결된 터널에 이어 놓아야 합니다.' };
    return { ok: true, connections, routes };
  }
  reachableRouteKeys(board) {
    const startKey = keyOf(this.config.start.x, this.config.start.y);
    const visited = new Set(routesOf(board[startKey]).map((_, index) => routeKey(startKey, index)));
    const queue = [...visited];
    while (queue.length) {
      const currentRouteKey = queue.shift();
      const [currentKey, routeIndexText] = currentRouteKey.split('#');
      const current = board[currentKey];
      const route = routesOf(current)[Number(routeIndexText)];
      for (const direction of route || []) {
        const delta = DIRECTIONS[direction];
        const nextKey = keyOf(current.x + delta.dx, current.y + delta.dy);
        const next = board[nextKey];
        if (!next || next.kind === 'GOAL') continue;
        for (const nextRouteIndex of routeIndexesWith(next, delta.opposite)) {
          const nextRouteKey = routeKey(nextKey, nextRouteIndex);
          if (!visited.has(nextRouteKey)) { visited.add(nextRouteKey); queue.push(nextRouteKey); }
        }
      }
    }
    return visited;
  }
  reachableKeys(board) { return new Set([...this.reachableRouteKeys(board)].map(item => item.split('#')[0])); }
  reachableGoalKeys(board) {
    const goals = new Set();
    for (const currentRouteKey of this.reachableRouteKeys(board)) {
      const [currentKey, routeIndexText] = currentRouteKey.split('#');
      const current = board[currentKey];
      for (const direction of routesOf(current)[Number(routeIndexText)] || []) {
        const delta = DIRECTIONS[direction];
        const nextKey = keyOf(current.x + delta.dx, current.y + delta.dy);
        if (board[nextKey]?.kind === 'GOAL') goals.add(nextKey);
      }
    }
    return goals;
  }
}
