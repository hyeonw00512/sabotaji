import { useMemo, useState } from 'react';
import { RecordsPanel } from './RecordsPanel.jsx';

function MineEmblem() {
  return <svg viewBox="0 0 160 130" aria-hidden="true">
    <path className="home-emblem-rock" d="M10 112 35 31 78 8l47 28 25 76Z" />
    <path className="home-emblem-tunnel" d="M37 112V77c0-25 19-45 43-45s43 20 43 45v35" />
    <path className="home-emblem-rail" d="M47 111 75 63M113 111 85 63M42 103h76" />
    <circle className="home-emblem-lamp" cx="80" cy="68" r="12" />
  </svg>;
}

export function StartScreen({ onCreate, onJoin, onRefresh, onRefreshRecords, publicRooms = [], records = [], busy, initialCode='' }) {
  const [nickname, setNickname] = useState(localStorage.getItem('mine:nickname') || '');
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ maxPlayers:8, rounds:3, turnSeconds:0, isPublic:false, actionCards:true, specialRules:false, aiReplacement:true });
  const inviteMode = useMemo(() => Boolean(initialCode), [initialCode]);
  const go = fn => { localStorage.setItem('mine:nickname', nickname.trim()); fn({ nickname, roomCode:code.trim().toUpperCase(), password, asSpectator, settings }); };
  const selectRoom = (roomCode, spectator) => { setCode(roomCode); setPassword(''); setAsSpectator(spectator); document.getElementById('room-code-input')?.focus(); };

  return <main className="start-shell home-shell">
    <section className="brand home-brand">
      <div className="home-emblem"><MineEmblem /></div>
      <p className="home-kicker">실시간 비밀 광산 게임</p>
      <h1>SABOTAJI</h1>
      <p className="home-subtitle">깊은갱도</p>
      <p className="lead">동료처럼 보이는 누군가가 길을 끊고 있습니다.<br/>광맥을 향한 길을 이어 정체를 밝혀내세요.</p>
      <div className="home-features" aria-label="게임 특징"><span>◆ 비밀 역할</span><span>◆ 터널 연결</span><span>◆ 실시간 추리</span></div>
    </section>
    <section className={`entry-card home-entry ${inviteMode ? 'invite-entry' : ''}`}>
      {inviteMode && <div className="invite-banner"><span className="invite-banner-icon">✦</span><div><b>초대받은 탐사대</b><p><strong>{initialCode}</strong> 방에 참가합니다</p></div></div>}
      {!inviteMode && <div className="entry-heading"><span>광산 입구</span><h2>탐사를 시작하세요</h2><p>방을 만들거나 받은 초대 코드로 합류할 수 있습니다.</p></div>}
      <label>닉네임<input value={nickname} maxLength={20} onChange={event => setNickname(event.target.value)} placeholder="게임에서 사용할 이름"/></label>
      {!inviteMode && <>
        <button className="setting-link" onClick={() => setShowSettings(value => !value)}>방 설정 {showSettings ? '접기' : '열기'}</button>
        {showSettings && <div className="settings-grid">
          <label>최대 인원<select value={settings.maxPlayers} onChange={event => setSettings({...settings,maxPlayers:+event.target.value})}>{[3,4,5,6,7,8,9,10].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>라운드<select value={settings.rounds} onChange={event => setSettings({...settings,rounds:+event.target.value})}>{[1,3,5].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>턴 시간<select value={settings.turnSeconds} onChange={event => setSettings({...settings,turnSeconds:+event.target.value})}><option value="0">제한 없음</option>{[30,45,60,90].map(value => <option key={value} value={value}>{value}초</option>)}</select></label>
          <label className="toggle-field"><input type="checkbox" checked={settings.isPublic} onChange={event => setSettings({...settings,isPublic:event.target.checked})}/><span>공개 방으로 만들기</span></label>
          <label className="toggle-field"><input type="checkbox" checked={settings.aiReplacement} onChange={event => setSettings({...settings,aiReplacement:event.target.checked})}/><span>장기 이탈 시 AI 대체</span></label>
          <label>방 비밀번호 <small>선택</small><input type="password" value={password} maxLength={50} onChange={event => setPassword(event.target.value)} placeholder="비워두면 비밀번호 없음"/></label>
        </div>}
        <button className="primary home-create" disabled={busy || !nickname.trim()} onClick={() => go(onCreate)}><span>⛏</span> 새 탐사대 만들기</button>
        <div className="divider"><span>또는 코드로 입장</span></div>
      </>}
      <label>{inviteMode ? '초대 방 코드' : '방 코드'}<input id="room-code-input" value={code} maxLength={6} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="예: A7K92D"/></label>
      <label>방 비밀번호 <small>필요한 경우</small><input type="password" value={password} maxLength={50} onChange={event => setPassword(event.target.value)} placeholder="비밀번호 입력"/></label>
      <label className="toggle-field"><input type="checkbox" checked={asSpectator} onChange={event => setAsSpectator(event.target.checked)}/><span>관전으로 입장</span></label>
      <button className="secondary home-join" disabled={busy || !nickname.trim() || code.length !== 6} onClick={() => go(onJoin)}>{busy ? '광산으로 연결 중…' : asSpectator ? '관전 시작' : inviteMode ? '초대받은 방 입장' : '방 참가하기'}</button>
      {inviteMode && <p className="invite-note">이 링크는 방 코드가 자동 입력됩니다. 닉네임만 정하면 바로 합류할 수 있어요.</p>}
      {!inviteMode && <section className="public-rooms">
        <div className="room-list-head"><h2>공개 대기실</h2><button onClick={onRefresh}>새로고침</button></div>
        {publicRooms.length === 0 ? <p className="muted">참가하거나 관전할 공개 방이 없습니다.</p> : <div className="room-list">{publicRooms.map(room => <div key={room.roomCode} className="room-row"><span>{room.requiresPassword ? '🔒' : '◇'}</span><div><b>{room.hostNickname}의 방</b><small>{room.roomCode} · {room.rounds}라운드 · 관전자 {room.spectatorCount}</small></div><em>{room.playerCount}/{room.maxPlayers}</em><div className="room-row-actions">{room.status === 'LOBBY' && <button onClick={() => selectRoom(room.roomCode, false)}>참가</button>}<button onClick={() => selectRoom(room.roomCode, true)}>관전</button></div></div>)}</div>}
      </section>}
      {!inviteMode && <RecordsPanel records={records} onRefresh={onRefreshRecords}/>} 
    </section>
  </main>;
}
