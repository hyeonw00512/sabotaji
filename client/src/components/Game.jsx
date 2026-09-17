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
  const isPlaying = state.game.phase === 'PLAYING';
  const isGoldDraft = state.game.phase === 'GOLD_DRAFT';
  const isTurn = isPlaying && !me.aiControlled && state.game.turnPlayerId === me.playerId;
  const turnName = state.players.find(player => player.id === state.game.turnPlayerId)?.nickname;
  const selectedCard = useMemo(() => me.hand.find(card => card.id === selected), [me.hand, selected]);
  const targetAction = selectedCard?.action === 'BREAK' || selectedCard?.action === 'REPAIR';
  useEffect(() => { if (!me.hand.some(card => card.id === selected)) setSelected(null); }, [me.hand, selected]);
  const finish = promise => promise.then(ok => { if (ok) setSelected(null); });
  const choose = card => { setSelected(card.id === selected ? null : card.id); setRotation(0); };
  const hint = !selectedCard ? '카드를 선택하거나 길 카드를 보드로 드래그하세요.' : selectedCard.type === 'PATH' ? '빈 칸을 클릭하거나 보드로 드래그해 터널을 배치하세요.' : targetAction ? '대상 플레이어를 선택하세요.' : selectedCard.action === 'REMOVE_PATH' ? '제거할 터널 카드를 선택하세요.' : '확인할 숨겨진 목표를 선택하세요.';

  return <main className="game-shell">
    <header className="game-header"><div><span className="eyebrow">라운드 {state.game.round}</span><h1>{isSpectator ? '관전 중' : isGoldDraft ? `${state.players.find(player => player.id === state.game.rewardPlayerId)?.nickname || '플레이어'} 님이 금 조각 선택 중` : isPlaying ? (isTurn ? '내 차례입니다' : `${turnName} 님의 차례`) : '라운드 결과'}</h1></div><div className="stats"><button className="sound-toggle" onClick={onSoundToggle} aria-label="효과음 켜기 또는 끄기">{soundOn ? '🔊' : '🔇'}</button><span>덱 <b>{state.game.deckCount}</b></span><span>버림 <b>{state.game.discardCount}</b></span><span className="role">{isSpectator ? '관전자' : me.role?.name}</span></div></header>
    <div className="game-grid">
      <aside className="players card"><h2>플레이어</h2>{state.players.map(player => <PlayerMini key={player.id} player={player} current={player.id === state.game.turnPlayerId}/>)}<p className="spectator-note">관전자 {state.spectators?.length || 0}명</p></aside>
      <Board state={state} selectedCard={isTurn ? selectedCard : null} onPlacePath={(x, y) => finish(onPlay({ cardId: selected, x, y, rotation }))} onDropPath={(cardId, x, y) => finish(onPlay({ cardId, x, y, rotation: 0 }))} onRemovePath={(x, y) => finish(onAction({ cardId: selected, x, y }))} onPeekGoal={goalIndex => finish(onAction({ cardId: selected, goalIndex }))}/>
      <ChatPanel state={state} onSend={onSend}/>
    </div>
    <section className="hand">
      <div className="hand-head"><div><span className="eyebrow">{isSpectator ? '관전 모드' : me.aiControlled ? 'AI 대행 중' : '내 손패'}</span><b>{isSpectator ? '비밀 역할·손패·목표 정보는 표시되지 않습니다.' : me.aiControlled ? 'AI가 이번 게임을 진행합니다. 다음 라운드부터 직접 플레이할 수 있습니다.' : hint}</b></div>{selectedCard && isTurn && <div className="card-actions">{selectedCard.type === 'PATH' && <button disabled={!selectedCard.rotatable} onClick={() => setRotation(value => value === 0 ? 180 : 0)}>회전 {rotation}°</button>}<button className="danger" onClick={() => finish(onDiscard(selected))}>버리기</button></div>}</div>
      {targetAction && isTurn && <div className="target-strip"><span>{selectedCard.name}: 대상 장비 선택</span>{state.players.flatMap(player => (selectedCard.equipmentOptions || [selectedCard.equipment]).map(equipment => <button key={`${player.id}-${equipment}`} disabled={['LEFT','RECONNECTING'].includes(player.connectionState) || (selectedCard.action === 'BREAK' ? !player.equipment[equipment] : player.equipment[equipment])} onClick={() => finish(onAction({ cardId: selected, targetPlayerId: player.id, equipment }))}>{player.nickname} · {equipmentNames[equipment]}</button>))}</div>}
      {me.peekedGoals?.length > 0 && <div className="peek-results">비밀 탐사 기록: {me.peekedGoals.map(item => <span key={item.goalIndex}>목표 {item.goalIndex + 1} · {item.goalType === 'TREASURE' ? '광맥' : '빈 암석'}</span>)}</div>}
      <div className="cards">{me.hand.map(card => <button key={card.id} className={`hand-card ${card.type === 'ACTION' ? 'action-card' : ''} ${selected === card.id ? 'selected' : ''}`} onClick={() => choose(card)} draggable={isTurn && card.type === 'PATH'} onDragStart={event => { setSelected(card.id); setRotation(0); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-saboteur-path', card.id); }} disabled={!isTurn}><div className="card-art" style={card.type === 'PATH' ? { transform: `rotate(${selected === card.id ? rotation : 0}deg)` } : {}}>{card.type === 'PATH' ? <PathIcon connections={card.connections} routes={card.routes}/> : <ActionIcon action={card.action} equipment={card.equipment} equipmentOptions={card.equipmentOptions}/>}</div><b>{card.name}</b><small>{card.type === 'ACTION' ? card.description : '터널 카드'}</small></button>)}</div>
    </section>
    <div className="mobile-dock"><button onClick={() => setMobilePanel(mobilePanel === 'players' ? null : 'players')}>대원</button><button onClick={() => setMobilePanel(mobilePanel === 'chat' ? null : 'chat')}>채팅·기록</button><span>{isSpectator ? '관전자' : me.role?.name}</span></div>
    {mobilePanel && <div className="mobile-sheet">{mobilePanel === 'chat' ? <ChatPanel state={state} onSend={onSend}/> : <div className="mobile-roster">{state.players.map(player => <PlayerMini key={player.id} player={player} current={player.id === state.game.turnPlayerId}/>)}</div>}<button className="sheet-close" onClick={() => setMobilePanel(null)}>닫기</button></div>}
    {isGoldDraft && <GoldDraft mine={Boolean(me.goldDraft)} options={me.goldDraft?.options || []} onChoose={onChooseGold}/>} 
    {!isPlaying && !isGoldDraft && <RoundResult result={state.game.result} host={state.hostId === me.playerId} final={state.game.phase === 'GAME_END'} onNextRound={onNextRound} onRematch={onRematch}/>} 
  </main>;
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
