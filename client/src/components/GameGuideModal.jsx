import { useEffect } from 'react';

const roles = [
  {
    id: 'miner',
    icon: '⛏',
    name: '탐사대',
    team: '광맥을 찾는 팀',
    description: '동료들과 터널을 연결해 세 개의 목표 중 진짜 광맥까지 길을 완성하세요.',
    victory: '진짜 광맥에 도달하면 승리하고, 연결에 성공한 탐사대가 금 조각을 선택합니다.'
  },
  {
    id: 'saboteur',
    icon: '◆',
    name: '교란자',
    team: '탐사를 방해하는 팀',
    description: '정체를 숨기고 잘못된 터널을 놓거나 장비를 고장 내 탐사를 지연시키세요.',
    victory: '덱과 모든 손패가 끝날 때까지 광맥을 찾지 못하게 하면 승리합니다.'
  }
];

const actionCards = [
  { icon: '⚒', name: '장비 고장', description: '다른 탐사대원의 곡괭이·수레·등불 중 하나를 고장냅니다.' },
  { icon: '✚', name: '장비 수리', description: '고장 난 장비 하나를 수리해 다시 터널 카드를 놓을 수 있게 합니다.' },
  { icon: '⌫', name: '터널 철거', description: '시작·목표 카드를 제외한 터널 카드 한 장을 제거합니다.' },
  { icon: '⌖', name: '탐사 지도', description: '아직 공개되지 않은 목표 하나를 자신만 확인합니다.' }
];

export function GameGuideModal({ onClose }) {
  useEffect(() => {
    const closeOnEscape = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return <div className="pregame-guide-overlay" role="dialog" aria-modal="true" aria-labelledby="pregame-guide-title" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="pregame-guide-dialog">
      <header><div><span className="eyebrow">EXPEDITION GUIDE</span><h2 id="pregame-guide-title">역할과 행동 카드</h2><p>역할은 게임을 시작할 때 서버가 비밀리에 배정합니다. 실제 배정 결과는 본인에게만 공개됩니다.</p></div><button className="secondary small" onClick={onClose}>닫기</button></header>
      <div className="guide-role-grid">{roles.map(role => <article className={`guide-role-card ${role.id}`} key={role.id}><span className="guide-role-icon" aria-hidden="true">{role.icon}</span><div><small>{role.team}</small><h3>{role.name}</h3><p>{role.description}</p><strong>{role.victory}</strong></div></article>)}</div>
      <section className="guide-action-section"><div className="section-title"><h3>주요 행동 카드</h3><span>카드를 사용하면 차례가 넘어갑니다</span></div><div className="guide-action-grid">{actionCards.map(card => <article key={card.name}><span aria-hidden="true">{card.icon}</span><div><h4>{card.name}</h4><p>{card.description}</p></div></article>)}</div></section>
      <p className="guide-secret-note"><b>비밀 정보 보호</b> 대기실에서는 가능한 역할만 설명하며, 이번 라운드에 누가 어떤 역할인지와 제외된 역할 카드는 공개하지 않습니다.</p>
    </section>
  </div>;
}
