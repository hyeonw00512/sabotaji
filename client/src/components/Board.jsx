import { useEffect, useMemo, useRef, useState } from 'react';
import { PathIcon } from './PathIcon.jsx';

const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
const directionData = { TOP:{ dx:0, dy:-1, opposite:'BOTTOM' }, RIGHT:{ dx:1, dy:0, opposite:'LEFT' }, BOTTOM:{ dx:0, dy:1, opposite:'TOP' }, LEFT:{ dx:-1, dy:0, opposite:'RIGHT' } };
const directions = Object.keys(directionData);
const cellKey = (x, y) => `${x},${y}`;
const routesOf = cell => cell?.routes || (cell?.connections ? [cell.connections] : []);
const rotateDirections = (base = [], rotation = 0) => {
  const order = ['TOP', 'RIGHT', 'BOTTOM', 'LEFT'];
  const steps = (((rotation % 360) + 360) % 360) / 90;
  return base.map(direction => order[(order.indexOf(direction) + steps) % 4]);
};

function reachableRoutes(cells, start) {
  const startKey = cellKey(start.x, start.y);
  const visited = new Set(routesOf(cells.get(startKey)).map((_, index) => `${startKey}#${index}`));
  const queue = [...visited];
  while (queue.length) {
    const active = queue.shift();
    const separator = active.lastIndexOf('#');
    const key = active.slice(0, separator);
    const routeIndex = Number(active.slice(separator + 1));
    const cell = cells.get(key);
    for (const direction of routesOf(cell)[routeIndex] || []) {
      const delta = directionData[direction];
      const neighborKey = cellKey(cell.x + delta.dx, cell.y + delta.dy);
      const neighbor = cells.get(neighborKey);
      if (!neighbor || neighbor.kind === 'GOAL') continue;
      routesOf(neighbor).forEach((route, index) => {
        if (route.includes(delta.opposite) && !visited.has(`${neighborKey}#${index}`)) {
          visited.add(`${neighborKey}#${index}`);
          queue.push(`${neighborKey}#${index}`);
        }
      });
    }
  }
  return visited;
}

function canPreviewPlacement(cells, start, card, x, y, rotation) {
  if (!card || cells.has(cellKey(x, y))) return false;
  const routes = (card.routes || [card.connections]).map(route => rotateDirections(route, rotation));
  const connections = [...new Set(routes.flat())];
  const reachable = reachableRoutes(cells, start);
  let adjacent = false;
  let connectsToStart = false;
  for (const direction of directions) {
    const delta = directionData[direction];
    const neighborKey = cellKey(x + delta.dx, y + delta.dy);
    const neighbor = cells.get(neighborKey);
    if (!neighbor) continue;
    adjacent = true;
    if (neighbor.kind === 'GOAL') continue;
    const mineOpen = connections.includes(direction);
    const neighborOpen = (neighbor.connections || []).includes(delta.opposite);
    if (mineOpen !== neighborOpen) return false;
    if (mineOpen && routesOf(neighbor).some((route, index) => route.includes(delta.opposite) && reachable.has(`${neighborKey}#${index}`))) connectsToStart = true;
  }
  return adjacent && connectsToStart;
}

export function Board({ state, selectedCard, rotation, onPlacePath, onRemovePath, onPeekGoal }) {
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [freshPathKeys, setFreshPathKeys] = useState(() => new Set());
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const knownPathKeys = useRef(null);
  const cells = useMemo(() => new Map(state.game.board.map(cell => [`${cell.x},${cell.y}`, cell])), [state.game.board]);
  const xs = useMemo(() => Array.from({ length:state.game.boardBounds.maxX - state.game.boardBounds.minX + 1 }, (_, index) => state.game.boardBounds.minX + index), [state.game.boardBounds]);
  const ys = useMemo(() => Array.from({ length:state.game.boardBounds.maxY - state.game.boardBounds.minY + 1 }, (_, index) => state.game.boardBounds.minY + index), [state.game.boardBounds]);
  const mode = selectedCard?.type === 'PATH' ? 'PLACE' : selectedCard?.action;
  const start = useMemo(() => state.game.board.find(cell => cell.kind === 'START'), [state.game.board]);
  useEffect(() => {
    const currentPathKeys = new Set(state.game.board.filter(cell => cell.kind === 'PATH').map(cell => cellKey(cell.x, cell.y)));
    if (knownPathKeys.current) {
      const added = [...currentPathKeys].filter(key => !knownPathKeys.current.has(key));
      if (added.length) {
        setFreshPathKeys(new Set(added));
        const timer = window.setTimeout(() => setFreshPathKeys(new Set()), 850);
        knownPathKeys.current = currentPathKeys;
        return () => window.clearTimeout(timer);
      }
    }
    knownPathKeys.current = currentPathKeys;
  }, [state.game.board]);
  const selectable = (cell, x, y) => (mode === 'PLACE' && canPreviewPlacement(cells, start, selectedCard, x, y, rotation)) || (mode === 'REMOVE_PATH' && cell?.kind === 'PATH') || (mode === 'PEEK_GOAL' && cell?.kind === 'GOAL' && !cell.revealed);
  const isPlacementPreview = (cell, x, y) => mode === 'PLACE' && canPreviewPlacement(cells, start, selectedCard, x, y, rotation);
  const placementCount = useMemo(() => mode === 'PLACE' ? ys.reduce((total, y) => total + xs.filter(x => isPlacementPreview(cells.get(cellKey(x, y)), x, y)).length, 0) : 0, [cells, mode, rotation, selectedCard, start, xs, ys]);
  const click = (cell, x, y) => { if (isPlacementPreview(cell, x, y)) onPlacePath(x, y); if (mode === 'REMOVE_PATH' && cell?.kind === 'PATH') onRemovePath(x, y); if (mode === 'PEEK_GOAL' && cell?.kind === 'GOAL' && !cell.revealed) onPeekGoal(cell.goalIndex); };
  const setPoint = event => pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const beginPinch = () => { if (pointers.current.size === 2) { const points = [...pointers.current.values()]; pinch.current = { distance: distance(points), zoom: view.z }; drag.current = null; } };
  const down = event => {
    setPoint(event); event.currentTarget.setPointerCapture(event.pointerId); beginPinch();
    if (pointers.current.size === 1 && !event.target.closest('.board-cell')) drag.current = { x:event.clientX, y:event.clientY, ox:view.x, oy:view.y };
  };
  const move = event => {
    if (!pointers.current.has(event.pointerId)) return; setPoint(event);
    if (pinch.current && pointers.current.size >= 2) { const points = [...pointers.current.values()]; setView(current => ({ ...current, z: Math.max(.65, Math.min(1.7, pinch.current.zoom * distance(points) / pinch.current.distance)) })); return; }
    const activeDrag = drag.current;
    if (activeDrag) setView(current => ({ ...current, x:activeDrag.ox + event.clientX - activeDrag.x, y:activeDrag.oy + event.clientY - activeDrag.y }));
  };
  const release = event => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) pinch.current = null; if (!pointers.current.size) drag.current = null; };
  return <div className="board-frame" onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onWheel={event => { setView(current => ({ ...current, z:Math.max(.65, Math.min(1.7, current.z - event.deltaY * .001)) })); }}>
    <div className={`board-guide ${mode === 'PLACE' && placementCount === 0 ? 'no-placement' : ''}`}>{mode === 'PLACE' ? placementCount ? `놓을 수 있는 초록 칸 ${placementCount}개` : '놓을 수 있는 칸이 없습니다 · 회전 또는 버리기' : mode ? '사용할 대상을 선택하세요' : '내 차례에 길 카드를 선택하세요'}</div>
    <div className="board" style={{ transform:`translate(${view.x}px,${view.y}px) scale(${view.z})`, '--board-columns':xs.length, '--board-rows':ys.length }}>
      {ys.flatMap(y => xs.map(x => {
        const cell = cells.get(`${x},${y}`);
        const candidate = selectable(cell, x, y);
        const interactionClass = mode === 'PLACE' ? 'place' : mode === 'REMOVE_PATH' ? 'remove' : mode === 'PEEK_GOAL' ? 'peek' : '';
        const interactionLabel = mode === 'PLACE' ? '놓기' : mode === 'REMOVE_PATH' ? '제거' : mode === 'PEEK_GOAL' ? '확인' : '';
        const isFreshPath = cell?.kind === 'PATH' && freshPathKeys.has(cellKey(x, y));
        return <button key={`${x},${y}`} data-cell={`${x},${y}`} data-interaction-label={candidate ? interactionLabel : undefined} className={`board-cell ${cell ? 'occupied' : ''} ${isFreshPath ? 'path-arrive' : ''} ${cell?.kind === 'GOAL' && cell.revealed ? 'goal-revealed' : ''} ${candidate ? `candidate candidate-${interactionClass}` : ''}`} onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()} onClick={() => click(cell, x, y)} aria-label={`${x}, ${y} 칸`}>
          {cell?.kind === 'START' && <><PathIcon connections={cell.connections} routes={cell.routes}/><span className="cell-label">출발</span></>}
          {cell?.kind === 'PATH' && <PathIcon connections={cell.connections} routes={cell.routes}/>}
          {cell?.kind === 'GOAL' && <PathIcon goal revealed={cell.revealed} treasure={cell.goalType === 'TREASURE'}/>}
        </button>;
      }))}
    </div>
  </div>;
}
