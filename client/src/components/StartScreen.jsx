import { useMemo, useState } from 'react';
import { RecordsPanel } from './RecordsPanel.jsx';

export function StartScreen({ onCreate, onJoin, onRefresh, onRefreshRecords, publicRooms, records, busy, initialCode='' }) {
  const [nickname, setNickname] = useState(localStorage.getItem('mine:nickname') || '');
  const [code, setCode] = useState(initialCode);
  const [password, setPassword] = useState('');
  const [asSpectator, setAsSpectator] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({ maxPlayers:8, rounds:3, turnSeconds:0, isPublic:false, actionCards:true, specialRules:false, aiReplacement:true });
  const inviteMode = useMemo(() => Boolean(initialCode), [initialCode]);
  const go = fn => { localStorage.setItem('mine:nickname', nickname.trim()); fn({ nickname, roomCode:code.trim().toUpperCase(), password, asSpectator, settings }); };
  const selectRoom = (roomCode, spectator) => { setCode(roomCode); setPassword(''); setAsSpectator(spectator); document.getElementById('room-code-input')?.focus(); };

  return <main className="start-shell">
    <section className="brand"><div className="brand-mark">◇</div><p>비밀 역할 · 길 연결 · 추리</p><h1>깊은갱도</h1><p className="lead">누군가는 광맥을 찾고, 누군가는 길을 틀어막습니다.</p></section>
    <section className="entry-card">
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
        <button className="primary" disabled={busy || !nickname.trim()} onClick={() => go(onCreate)}>새 방 만들기</button>
        <div className="divider"><span>또는 코드로 입장</span></div>
      </>}
      <label>방 코드<input id="room-code-input" value={code} maxLength={6} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="예: A7K92D"/></label>
      <label>방 비밀번호 <small>필요한 경우</small><input type="password" value={password} maxLength={50} onChange={event => setPassword(event.target.value)} placeholder="비밀번호 입력"/></label>
      <label className="toggle-field"><input type="checkbox" checked={asSpectator} onChange={event => setAsSpectator(event.target.checked)}/><span>관전으로 입장</span></label>
      <button className="secondary" disabled={busy || !nickname.trim() || code.length !== 6} onClick={() => go(onJoin)}>{busy ? '연결 중…' : asSpectator ? '관전 시작' : '방 참가하기'}</button>
      {!inviteMode && <section className="public-rooms">
        <div className="room-list-head"><h2>공개 대기실</h2><button onClick={onRefresh}>새로고침</button></div>
        {publicRooms.length === 0 ? <p className="muted">참가하거나 관전할 공개 방이 없습니다.</p> : <div className="room-list">{publicRooms.map(room => <div key={room.roomCode} className="room-row"><span>{room.requiresPassword ? '🔒' : '◇'}</span><div><b>{room.hostNickname}의 방</b><small>{room.roomCode} · {room.rounds}라운드 · 관전자 {room.spectatorCount}</small></div><em>{room.playerCount}/{room.maxPlayers}</em><div className="room-row-actions">{room.status === 'LOBBY' && <button onClick={() => selectRoom(room.roomCode, false)}>참가</button>}<button onClick={() => selectRoom(room.roomCode, true)}>관전</button></div></div>)}</div>}
      </section>}
      {!inviteMode && <RecordsPanel records={records} onRefresh={onRefreshRecords}/>} 
    </section>
  </main>;
}
