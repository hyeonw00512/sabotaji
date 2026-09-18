import { useEffect, useMemo, useState } from 'react';
import { Board } from './Board.jsx';
import { ChatPanel } from './ChatPanel.jsx';
import { PathIcon } from './PathIcon.jsx';
import { ActionIcon } from './ActionIcon.jsx';

const equipmentNames = { PICK: '곡괭이', CART: '수레', LAMP: '등불' };

export function Game({ state, me, isSpectator, soundOn, onSoundToggle, onPlay, onAction, onDiscard, onChooseGold, onSend, onNextRound, onRematch }) {
  const [selected, setSelected] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [dismissedRoleRevealId, setDismissedRoleRevealId] = useState(null);
  const [dismissedGoalRevealId, setDismissedGoalRevealId] = useState(null);
  const [dismissedPeekRevealId, setDismissedPeekRevealId] = useState(null);
  const [roleReviewOpen, setRoleReviewOpen] = useState(false);
  const isPlaying = state.game.phase === 'PLAYING';
  const isGoldDraft = state.game.phase === 'GOLD_DRAFT';
  const isTurn = isPlaying && !me.aiControlled && state.game.turnPlayerId === me.playerId;
  const turnName = state.players.find(player => player.id === state.game.turnPlayerId)?.nickname;
  const selectedCard = useMemo(() => me.hand.find(card => card.id === selected), [me.hand, selected]);
  const targetAction = selectedCard?.action === 'BREAK' || selectedCard?.action === 'REPAIR';
  const showRoleReveal = !isSpectator && Boolean(me.role) && (roleReviewOpen || (isPlaying && me.roleRevealId === state.game.roleRevealId && dismissedRoleRevealId !== state.game.roleRevealId));
  const goalReveal = state.game.goalReveal;
  const showGoalReveal = Boolean(goalReveal?.id) && dismissedGoalRevealId !== goalReveal.id;
  const peekReveal = me.peekReveal;
  const showPeekReveal = !isSpectator && Boolean(peekReveal?.id) && dismissedPeekRevealId !== peekReveal.id;
  useEffect(() => { document.body.classList.add('game-active'); return () => document.body.classList.remove('game-active'); }, []);
  useEffect(() => { if (!me.hand.some(card => card.id === selected)) setSelected(null); }, [me.hand, selected]);
  const finish = promise => promise.then(ok => { if (ok) setSelected(null); });
  const choose = card => { setSelected(card.id === selected ? null : card.id); setRotation(0); };
  const hint = !selectedCard ? '길 카드 또는 아이템 카드를 선택하세요.' : selectedCard.type === 'PATH' ? '초록색 놓기 칸을 클릭해 터널을 배치하세요.' : targetAction ? '대상과 장비를 선택하세요.' : selectedCard.action === 'REMOVE_PATH' ? '제거할 터널 카드를 선택하세요.' : '확인할 숨겨진 목표를 선택하세요.';

  return <main className="game-shell">
    <header className="game-header"><div><span className="eyebrow">라운드 {state.game.round}</span><h1>{isSpectator ? '관전 중' : isGoldDraft ? `${state.players.find(player => player.id === state.game.rewardPlayerId)?.nickname || '플레이어'} 님이 금 조각 선택 중` : isPlaying ? (isTurn ? '내 차례입니다' : `${turnName} 님의 차례`) : '라운드 결과'}</h1></div><div className="stats"><button className="sound-toggle" onClick={onSoundToggle} aria-label="효과음 켜기 또는 끄기">{soundOn ? '🔊' : '🔇'}</button><span>덱 <b>{state.game.deckCount}</b></span><span>버림 <b>{state.game.discardCount}</b></span><span className="role">{isSpectator ? '관전자' : me.role?.name}</span></div></header>
    <div className="game-grid">
      <aside className="players card"><h2>플레이어</h2>{state.players.map(player => <PlayerMini key={player.id} player={player} current={player.id === state.game.turnPlayerId}/>)}<p className="spectator-note">관전자 {state.spectators?.length || 0}명</p></aside>
      <Board state={state} selectedCard={isTurn ? selectedCard : null} rotation={rotation} onPlacePath={(x, y) => finish(onPlay({ cardId: selected, x, y, rotation }))} onRemovePath={(x, y) => finish(onAction({ cardId: selected, x, y }))} onPeekGoal={goalIndex => finish(onAction({ cardId: selected, goalIndex }))}/>
      <ChatPanel state={state} onSend={onSend}/>
    </div>
    <section className="hand">
      <div className="hand-head"><div><span className="eyebrow">{isSpectator ? '관전 모드' : me.aiControlled ? 'AI 대행 중' : '내 손패'}</span><b>{isSpectator ? '비밀 역할·손패·목표 정보는 표시되지 않습니다.' : me.aiControlled ? 'AI가 이번 게임을 진행합니다. 다음 라운드부터 직접 플레이할 수 있습니다.' : hint}</b></div><div className="hand-head-actions">{!isSpectator && me.role && <button className={`hand-role ${me.role.team === 'SABOTEURS' ? 'saboteur' : 'miner'}`} onClick={() => setRoleReviewOpen(true)}><span>내 직업</span><b>{me.role.name}</b></button>}{selectedCard && isTurn && <div className="card-actions">{selectedCard.type === 'PATH' && <button disabled={!selectedCard.rotatable} onClick={() => setRotation(value => value === 0 ? 180 : 0)}>회전 {rotation}°</button>}<button className="danger" onClick={() => finish(onDiscard(selected))}>버리기</button></div>}</div></div>
      {targetAction && isTurn && <section className="action-target-panel"><div><span className="eyebrow">아이템 사용</span><b>{selectedCard.name} · 대상과 장비를 클릭하세요</b></div><div className="target-strip">{state.players.flatMap(player => (selectedCard.equipmentOptions || [selectedCard.equipment]).map(equipment => <button key={`${player.id}-${equipment}`} disabled={['LEFT','RECONNECTING'].includes(player.connectionState) || (selectedCard.action === 'BREAK' ? !player.equipment[equipment] : player.equipment[equipment])} onClick={() => finish(onAction({ cardId: selected, targetPlayerId: player.id, equipment }))}>{selectedCard.action === 'BREAK' ? '고장' : '수리'} · {player.nickname} · {equipmentNames[equipment]}</button>))}</div></section>}
      {me.peekedGoals?.length > 0 && <div className="peek-results">비밀 탐사 기록: {me.peekedGoals.map(item => <span key={item.goalIndex}>목표 {item.goalIndex + 1} · {item.goalType === 'TREASURE' ? '광맥' : '빈 암석'}</span>)}</div>}
      <div className="cards">{me.hand.map(card => <button key={card.id} className={`hand-card ${card.type === 'ACTION' ? 'action-card' : ''} ${selected === card.id ? 'selected' : ''}`} onClick={() => choose(card)} disabled={!isTurn}><div className="card-art" style={card.type === 'PATH' ? { transform: `rotate(${selected === card.id ? rotation : 0}deg)` } : {}}>{card.type === 'PATH' ? <PathIcon connections={card.connections} routes={card.routes}/> : <ActionIcon action={card.action} equipment={card.equipment} equipmentOptions={card.equipmentOptions}/>}</div><b>{card.name}</b><small>{card.type === 'ACTION' ? card.description : '터널 카드'}</small></button>)}</div>
    </section>
    <div className="mobile-dock"><button onClick={() => setMobilePanel(mobilePanel === 'players' ? null : 'players')}>대원</button><button onClick={() => setMobilePanel(mobilePanel === 'chat' ? null : 'chat')}>채팅·기록</button><span>{isSpectator ? '관전자' : me.role?.name}</span></div>
    {mobilePanel && <div className="mobile-sheet">{mobilePanel === 'chat' ? <ChatPanel state={state} onSend={onSend}/> : <div className="mobile-roster">{state.players.map(player => <PlayerMini key={player.id} player={player} current={player.id === state.game.turnPlayerId}/>)}</div>}<button className="sheet-close" onClick={() => setMobilePanel(null)}>닫기</button></div>}
    {showRoleReveal && <RoleReveal role={me.role} round={state.game.round} onConfirm={() => { setDismissedRoleRevealId(state.game.roleRevealId); setRoleReviewOpen(false); }}/>}
    {!showRoleReveal && showGoalReveal && <GoalReveal goal={goalReveal} onConfirm={() => setDismissedGoalRevealId(goalReveal.id)}/>}
    {!showRoleReveal && !showGoalReveal && showPeekReveal && <PeekReveal goal={peekReveal} onConfirm={() => setDismissedPeekRevealId(peekReveal.id)}/>}
    {isGoldDraft && <GoldDraft mine={Boolean(me.goldDraft)} options={me.goldDraft?.options || []} onChoose={onChooseGold}/>} 
    {!isPlaying && !isGoldDraft && <RoundResult result={state.game.result} host={state.hostId === me.playerId} final={state.game.phase === 'GAME_END'} onNextRound={onNextRound} onRematch={onRematch}/>} 
  </main>;
}

function RoleReveal({ role, round, onConfirm }) {
  const saboteur = role.team === 'SABOTEURS';
  return <div className="role-reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="role-reveal-title"><section className={`role-reveal-card ${saboteur ? 'saboteur' : 'miner'}`}><span className="eyebrow">라운드 {round} · 비밀 역할</span><div className="role-emblem" aria-hidden="true">{saboteur ? '⚠' : '⛏'}</div><h2 id="role-reveal-title">당신은 {role.name}</h2><p>{role.description}</p><small>이 정보는 본인에게만 표시됩니다.</small><button className="primary" onClick={onConfirm}>확인하고 시작</button></section></div>;
}

function GoalReveal({ goal, onConfirm }) {
  const treasure = goal.goalType === 'TREASURE';
  return <div className="role-reveal-overlay goal-reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="goal-reveal-title"><section className={`role-reveal-card goal-reveal-card ${treasure ? 'miner' : 'saboteur'}`}><span className="eyebrow">목표 카드 공개</span><div className="role-emblem" aria-hidden="true">{treasure ? '◆' : '×'}</div><h2 id="goal-reveal-title">{treasure ? '광맥을 발견했습니다!' : '꽝! 빈 암석입니다'}</h2><p>{treasure ? '진짜 광맥이 공개되었습니다. 탐사대가 보상을 선택합니다.' : '목표 카드를 뒤집어 모두에게 공개했습니다. 다른 목표를 향해 계속 탐사하세요.'}</p><button className="primary" onClick={onConfirm}>확인</button></section></div>;
}

function PeekReveal({ goal, onConfirm }) {
  const treasure = goal.goalType === 'TREASURE';
  return <div className="role-reveal-overlay peek-reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="peek-reveal-title"><section className={`role-reveal-card peek-reveal-card ${treasure ? 'miner' : 'saboteur'}`}><span className="eyebrow">비밀 지도 확인</span><div className="flip-card" aria-hidden="true"><div className="flip-card-inner"><div className="flip-card-face flip-card-front">?</div><div className="flip-card-face flip-card-back">{treasure ? '◆' : '×'}</div></div></div><h2 id="peek-reveal-title">{treasure ? '진짜 광맥입니다' : '꽝! 빈 암석입니다'}</h2><p>이 결과는 당신만 확인했습니다. 다른 탐사대원에게는 공개되지 않습니다.</p><button className="primary" onClick={onConfirm}>확인</button></section></div>;
}

function GoldDraft({ mine, options, onChoose }) {
  return <div className="result-overlay"><section className="result-card gold-draft"><span className="eyebrow">금 조각 선택</span><h2>{mine ? '가져갈 금 조각을 고르세요' : '탐사대가 금 조각을 고르는 중입니다'}</h2><p>{mine ? '선택한 금 조각은 즉시 공개되며, 다음 탐사대에게 선택권이 넘어갑니다.' : '선택 내용은 모두의 선택이 끝난 뒤 공개됩니다.'}</p>{mine && <div className="gold-options">{options.map(option => <button key={option.id} onClick={() => onChoose(option.id)}><b>금 {option.value}</b><span>조각</span></button>)}</div>}</section></div>;
}

function PlayerMini({ player, current }) { const state = player.connectionState === 'LEFT' ? '이탈' : player.connectionState === 'RECONNECTING' ? '재접속 대기' : player.connectionState === 'AI' ? 'AI 대행' : ''; return <div className={`player-mini ${current ? 'turn' : ''} ${state ? 'disconnected' : ''}`}><div><b>{player.nickname}</b><span>{state || `${player.cardCount}장 · ${player.score || 0}점`}</span></div><div className="equipment"><i className={player.equipment.PICK ? '' : 'broken'}>곡괭이</i><i className={player.equipment.CART ? '' : 'broken'}>수레</i><i className={player.equipment.LAMP ? '' : 'broken'}>등불</i></div></div>; }

function RoundResult({ result, host, final, onNextRound, onRematch }) {
  const winner = result?.winnerTeam === 'MINERS' ? '탐사대' : '교란자';
  const champions = result?.champions || [];
  return <div className="result-overlay"><section className="result-card"><span className="eyebrow">{final ? '최종 결과' : '라운드 종료'}</span><h2>{final && champions.length ? `${champions.map(player => player.nickname).join(', ')} ${champions.length > 1 ? '공동 최종 1위' : '님 최종 1위'}` : `${winner} 팀 승리`}</h2><p>{result?.reason}</p><p className="reward">{result?.tokenLabel || '보상'} 분배: {result?.awards?.length ? result.awards.map((award, index) => <span key={`${award.playerId}-${index}`}>+{award.value}</span>) : '없음'}</p><div className="result-roles">{result?.roles.map(player => <div key={player.id}><b>{player.nickname}</b><span>{player.roleName}{player.roundRewards?.length ? ` · 이번 ${player.roundRewards.join(' + ')}` : ''}</span><strong>{player.score}{result?.tokenLabel || '점'}</strong></div>)}</div>{result?.unusedRoles?.length > 0 && <p className="muted">제외된 역할 카드: {result.unusedRoles.map(role => role.roleName).join(', ')}</p>}{final && result?.finalRanking && <ol className="final-ranking">{result.finalRanking.map((player, index) => <li key={player.id}><span>{index + 1}위 · {player.nickname}</span><b>{player.score}{result.tokenLabel}</b></li>)}</ol>}{host ? <button className="primary" onClick={final ? onRematch : onNextRound}>{final ? '재경기 대기실로' : '다음 라운드 시작'}</button> : <p className="muted">방장이 다음 진행을 시작할 때까지 기다리는 중입니다.</p>}</section></div>;
}
