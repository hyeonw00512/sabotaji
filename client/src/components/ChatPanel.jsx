import { useEffect, useRef, useState } from 'react';

const timeFormatter = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const formatTime = value => value ? timeFormatter.format(new Date(value)) : '--:--:--';

export function ChatPanel({ state, onSend }) {
  const [tab, setTab] = useState('chat');
  const [text, setText] = useState('');
  const end = useRef();
  const items = tab === 'chat' ? state.chat : state.logs;
  useEffect(() => { void end.current?.scrollIntoView({ behavior: 'smooth' }); }, [state.chat, state.logs, tab]);
  const submit = event => { event.preventDefault(); if (text.trim()) { onSend(text); setText(''); } };
  return <aside className="side-panel"><div className="tabs"><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>채팅</button><button className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>기록</button></div><div className={`messages ${tab === 'log' ? 'timeline' : 'chat-timeline'}`}>{!items.length && <p className="muted">아직 내용이 없습니다.</p>}{items.map(item => <article key={item.id} className={`message-item ${item.type === 'SYSTEM' ? 'system' : ''}`}><time dateTime={item.at ? new Date(item.at).toISOString() : undefined}>{formatTime(item.at)}</time><div>{item.nickname && <b>{item.nickname}{item.spectator ? ' · 관전' : ''}</b>}<p>{item.message}</p></div></article>)}<span ref={end}/></div>{tab === 'chat' && <form onSubmit={submit}><input value={text} maxLength={300} onChange={event => setText(event.target.value)} placeholder="메시지 입력"/><button>전송</button></form>}</aside>;
}
