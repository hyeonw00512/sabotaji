import { useState } from 'react';
import { ChatPanel } from './ChatPanel.jsx';

export function Lobby({ state, me, isSpectator, onReady, onStart, onSend, onLeave }) {
  const invite = `${location.origin}/?room=${state.roomCode}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(invite);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('초대 링크를 복사하세요.', invite);
    }
  };
  const meInRoom = state.players.find(player => player.id === me.playerId);

  return <main className="lobby-shell">
    <header className="topbar"><div><span className="eyebrow">대기실 · 광산 입구</span><h1>방 코드 <strong>{state.roomCode}</strong></h1></div><div className="topbar-actions"><button className="secondary small" onClick={copy}>{copied ? '복사됨 ✓' : '초대 링크 복사'}</button><button className="danger small" onClick={onLeave}>나가기</button></div></header>
    <section className="lobby-content">
      <div className="roster card">
        <div className="lobby-invite"><span>초대 링크</span><code>{invite}</code><button onClick={copy}>{copied ? '복사됨' : '복사'}</button></div>
        <div className="section-title"><h2>탐사대원</h2><span>{state.players.length}/{state.settings.maxPlayers}</span></div>
        {state.players.map(player => <div className="player-row" key={player.id}><span className={`presence ${player.connected ? 'online' : ''}`}/><b>{player.nickname}</b>{player.id === state.hostId && <em>방장</em>}<span className="spacer"/><span>{player.connectionState === 'AI' ? 'AI 대행' : player.connectionState === 'RECONNECTING' ? '재접속 대기' : player.connectionState === 'LEFT' ? '이탈' : player.ready || player.id === state.hostId ? '준비' : '대기'}</span></div>)}
        <div className="rules"><span>{state.settings.rounds} 라운드</span><span>{state.settings.turnSeconds ? `${state.settings.turnSeconds}초 턴` : '시간 제한 없음'}</span></div>
        {state.spectators?.length > 0 && <p className="spectator-note">관전자 {state.spectators.length}명 · {state.spectators.map(item => item.nickname).join(', ')}</p>}
        <div className="lobby-actions">
          {isSpectator ? <p className="hint">관전 중입니다. 게임 시작 후 공개 보드와 채팅을 볼 수 있습니다.</p> : me.aiControlled ? <p className="hint">AI가 이번 게임을 대행 중입니다. 다음 라운드부터 직접 플레이할 수 있습니다.</p> : <>
            {me.playerId !== state.hostId && <button className="secondary" onClick={onReady}>{meInRoom?.ready ? '준비 취소' : '준비하기'}</button>}
            {me.playerId === state.hostId && <button className="primary" disabled={state.players.length < 3} onClick={onStart}>게임 시작</button>}
            <p className="hint">3명 이상, 방장을 제외한 모두가 준비해야 합니다.</p>
          </>}
        </div>
      </div>
      <ChatPanel state={state} onSend={onSend}/>
    </section>
  </main>;
}
