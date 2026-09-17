import { useMemo, useRef, useState } from 'react';
import { PathIcon } from './PathIcon.jsx';

const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);

export function Board({ state, selectedCard, onPlacePath, onDropPath, onRemovePath, onPeekGoal }) {
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const moved = useRef(false);
  const cells = useMemo(() => new Map(state.game.board.map(cell => [`${cell.x},${cell.y}`, cell])), [state.game.board]);
  const xs = useMemo(() => Array.from({ length:state.game.boardBounds.maxX - state.game.boardBounds.minX + 1 }, (_, index) => state.game.boardBounds.minX + index), [state.game.boardBounds]);
  const ys = useMemo(() => Array.from({ length:state.game.boardBounds.maxY - state.game.boardBounds.minY + 1 }, (_, index) => state.game.boardBounds.minY + index), [state.game.boardBounds]);
  const mode = selectedCard?.type === 'PATH' ? 'PLACE' : selectedCard?.action;
  const selectable = cell => (mode === 'PLACE' && !cell) || (mode === 'REMOVE_PATH' && cell?.kind === 'PATH') || (mode === 'PEEK_GOAL' && cell?.kind === 'GOAL' && !cell.revealed);
  const click = (cell, x, y) => { if (moved.current) { moved.current = false; return; } if (mode === 'PLACE' && !cell) onPlacePath(x, y); if (mode === 'REMOVE_PATH' && cell?.kind === 'PATH') onRemovePath(x, y); if (mode === 'PEEK_GOAL' && cell?.kind === 'GOAL' && !cell.revealed) onPeekGoal(cell.goalIndex); };
  const drop = event => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData('application/x-saboteur-path');
    const cellElement = event.target.closest('.board-cell');
    if (!cardId || !cellElement) return;
    const [x, y] = cellElement.dataset.cell.split(',').map(Number);
    onDropPath(cardId, x, y);
  };
  const setPoint = event => pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const beginPinch = () => { if (pointers.current.size === 2) { const points = [...pointers.current.values()]; pinch.current = { distance: distance(points), zoom: view.z }; drag.current = null; } };
  const down = event => {
    setPoint(event); event.currentTarget.setPointerCapture(event.pointerId); beginPinch();
    moved.current = false;
    if (pointers.current.size === 1 && !event.target.closest('.board-cell')) drag.current = { x:event.clientX, y:event.clientY, ox:view.x, oy:view.y };
  };
  const move = event => {
    if (!pointers.current.has(event.pointerId)) return; setPoint(event);
    if (pinch.current && pointers.current.size >= 2) { moved.current = true; const points = [...pointers.current.values()]; setView(current => ({ ...current, z: Math.max(.65, Math.min(1.7, pinch.current.zoom * distance(points) / pinch.current.distance)) })); return; }
    const activeDrag = drag.current;
    if (activeDrag) { if (Math.abs(event.clientX - activeDrag.x) + Math.abs(event.clientY - activeDrag.y) > 4) moved.current = true; setView(current => ({ ...current, x:activeDrag.ox + event.clientX - activeDrag.x, y:activeDrag.oy + event.clientY - activeDrag.y })); }
  };
  const release = event => { pointers.current.delete(event.pointerId); if (pointers.current.size < 2) pinch.current = null; if (!pointers.current.size) drag.current = null; };
  return <div className="board-frame" onPointerDown={down} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onWheel={event => { setView(current => ({ ...current, z:Math.max(.65, Math.min(1.7, current.z - event.deltaY * .001)) })); }} onDragOver={event => event.preventDefault()} onDrop={drop}><div className="board" style={{ transform:`translate(${view.x}px,${view.y}px) scale(${view.z})`, '--board-columns':xs.length, '--board-rows':ys.length }}>{ys.flatMap(y => xs.map(x => { const cell = cells.get(`${x},${y}`); return <button key={`${x},${y}`} data-cell={`${x},${y}`} className={`board-cell ${cell?'occupied':''} ${cell?.kind==='GOAL'&&cell.revealed?'goal-revealed':''} ${selectable(cell)?'candidate':''}`} onClick={() => click(cell,x,y)} aria-label={`${x}, ${y} 칸`}>{cell?.kind==='START'&&<><PathIcon connections={cell.connections} routes={cell.routes}/><span className="cell-label">출발</span></>}{cell?.kind==='PATH'&&<PathIcon connections={cell.connections} routes={cell.routes}/>} {cell?.kind==='GOAL'&&<PathIcon goal treasure={cell.goalType==='TREASURE'}/>}</button>; }))}</div></div>;
}
