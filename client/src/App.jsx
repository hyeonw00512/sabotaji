import { useEffect, useRef, useState } from 'react';
import { socket, emitAck } from './socket.js';
import { StartScreen } from './components/StartScreen.jsx';
import { Lobby } from './components/Lobby.jsx';
import { Game } from './components/Game.jsx';
import { isSoundEnabled, playCue, setSoundEnabled } from './sound.js';

const storageKey = 'mine:session';
const platformJoinToken = new URLSearchParams(location.search).get('joinToken');
const platformHomeUrl = () => new URLSearchParams(location.search).get('platformUrl') || import.meta.env.VITE_PLATFORM_URL || document.referrer || '/';
const platformActivityToken = new URLSearchParams(location.search).get('platformActivityToken');
let lastPlatformActivity = '';
const reportPlatformActivity = status => {
  if (!platformActivityToken || lastPlatformActivity === status) return;
  lastPlatformActivity = status;
  let endpoint;
  try { endpoint = new URL('/api/activity', platformHomeUrl()).toString(); } catch { return; }
  fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ token:platformActivityToken, status }), keepalive:true }).catch(() => { lastPlatformActivity = ''; });
};
const cueFromLog = message => /배치/.test(message) ? 'place' : /고장|수리|제거/.test(message) ? 'action' : /공개/.test(message) ? 'reveal' : /승리/.test(message) ? 'victory' : null;
const readSession = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return saved?.roomCode && saved?.reconnectToken ? saved : null;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
};

export function App() {
  const [state, setState] = useState(null);
  const [me, setMe] = useState({ playerId:null, hand:[], role:null, isSpectator:false });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [records, setRecords] = useState({ totalGames:0, leaderboard:[], recentGames:[] });
  const [soundOn, setSoundOn] = useState(isSoundEnabled);
  const soundRef = useRef(soundOn);
  const platformJoinAttempted = useRef(false);
  const lastLogId = useRef(null);
  const initialCode = new URLSearchParams(location.search).get('room')?.toUpperCase() || '';
  useEffect(() => { soundRef.current = soundOn; setSoundEnabled(soundOn); }, [soundOn]);
  useEffect(() => { reportPlatformActivity(!state || state.status === 'LOBBY' ? 'LOBBY' : me.isSpectator ? 'SPECTATING' : 'PLAYING'); }, [state?.status, me.isSpectator]);
  const notify = message => { setToast(message); setTimeout(() => setToast(''), 2800); };

  useEffect(() => {
    const game = incoming => {
      const last = incoming.logs?.at(-1);
      if (last?.id && last.id !== lastLogId.current) { if (lastLogId.current) playCue(cueFromLog(last.message), soundRef.current); lastLogId.current = last.id; }
      setState(incoming);
    };
    const priv = incoming => setMe({ ...incoming, isSpectator:false });
    const error = message => { notify(message); playCue('error', soundRef.current); };
    const roomList = rooms => setPublicRooms(rooms);
    const refreshRecords = () => emitAck('getRecords').then(setRecords).catch(() => {});
    const refreshRooms = () => emitAck('listRooms').then(result => setPublicRooms(result.rooms)).catch(() => {});
    const reconnect = () => {
      const saved = readSession();
      if (platformJoinToken && !platformJoinAttempted.current) { platformJoinAttempted.current = true; localStorage.removeItem(storageKey); enter('platformJoin', { joinToken: platformJoinToken }); }
      else if (saved) emitAck('reconnectRoom', saved).then(result => { if (result.isSpectator) setMe({ playerId:null, hand:[], role:null, isSpectator:true }); }).catch(() => localStorage.removeItem(storageKey));
    };
    const connected = () => { reconnect(); refreshRooms(); refreshRecords(); };
    socket.on('gameState', game); socket.on('privateState', priv); socket.on('gameError', error); socket.on('roomList', roomList); socket.on('connect', connected);
    if (socket.connected) connected();
    return () => { socket.off('gameState', game); socket.off('privateState', priv); socket.off('gameError', error); socket.off('roomList', roomList); socket.off('connect', connected); };
  }, []);

  const enter = async (event, payload) => {
    setBusy(true);
    try {
      const result = await emitAck(event, payload);
      localStorage.setItem(storageKey, JSON.stringify({ roomCode:result.roomCode, reconnectToken:result.reconnectToken }));
      history.replaceState({}, '', `/?room=${result.roomCode}`);
      if (result.isSpectator) setMe({ playerId:null, hand:[], role:null, isSpectator:true });
    } catch (error) { notify(error.message); playCue('error', soundRef.current); } finally { setBusy(false); }
  };
  const action = (event, payload = {}) => emitAck(event, payload).then(() => true).catch(error => { notify(error.message); playCue('error', soundRef.current); return false; });
  const leaveRoom = async () => {
    if (!window.confirm('방에서 나갈까요? 진행 중인 게임은 나가기 후 재접속할 수 없으며, 서버가 기존 이탈 규칙을 적용합니다.')) return;
    setBusy(true);
    try {
      await emitAck('leaveRoom');
      localStorage.removeItem(storageKey);
      history.replaceState({}, '', '/');
      setState(null);
      setMe({ playerId:null, hand:[], role:null, isSpectator:false });
      notify('방에서 나왔습니다.');
      refreshRooms();
    } catch (error) { notify(error.message); } finally { setBusy(false); }
  };
  const refreshRooms = () => emitAck('listRooms').then(result => setPublicRooms(result.rooms)).catch(error => notify(error.message));
  const refreshRecords = () => emitAck('getRecords').then(setRecords).catch(error => notify(error.message));
  const returnToPlatform = () => window.location.assign(platformHomeUrl());
  if (!state) return <><StartScreen busy={busy} initialCode={initialCode} publicRooms={publicRooms} records={records} onRefresh={refreshRooms} onRefreshRecords={refreshRecords} onCreate={payload => enter('createRoom', payload)} onJoin={payload => enter('joinRoom', payload)}/>{toast && <div className="toast">{toast}</div>}</>;
  return <>{state.status === 'LOBBY' ? <Lobby state={state} me={me} isSpectator={me.isSpectator} onReady={() => action('playerReady')} onStart={() => action('startGame')} onSend={message => action('chatMessage', { message })} onLeave={leaveRoom} onPlatform={returnToPlatform}/> : <Game state={state} me={me} isSpectator={me.isSpectator} soundOn={soundOn} onSoundToggle={() => setSoundOn(value => !value)} onPlay={payload => action('playPathCard', payload)} onAction={payload => action('playActionCard', payload)} onDiscard={cardId => action('discardCard', { cardId })} onChooseGold={rewardId => action('chooseGold', { rewardId })} onSend={message => action('chatMessage', { message })} onNextRound={() => action('nextRound')} onRematch={() => action('rematch')} onLeave={leaveRoom} onPlatform={returnToPlatform}/>} {toast && <div className="toast">{toast}</div>}</>;
}
