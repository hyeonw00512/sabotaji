export function RecordsPanel({ records, onRefresh }) {
  const games = records?.recentGames || [];
  const leaders = records?.leaderboard || [];
  return <section className="records-panel">
    <div className="records-head"><div><span className="eyebrow">기록 보관소</span><h2>누적 전적</h2></div><button onClick={onRefresh}>새로고침</button></div>
    <p className="record-note">계정 연동 전에는 닉네임 기준의 임시 기록입니다.</p>
    <div className="record-columns">
      <div><h3>순위</h3>{leaders.length ? <ol className="leaderboard">{leaders.slice(0, 5).map((player, index) => <li key={player.nickname}><span>{index + 1}</span><b>{player.nickname}</b><small>{player.score}점 · {player.wins}/{player.games}승</small></li>)}</ol> : <p className="muted">아직 완료된 게임이 없습니다.</p>}</div>
      <div><h3>최근 게임</h3>{games.length ? <ul className="recent-games">{games.slice(0, 4).map(game => <li key={game.id}><b>{game.winnerTeam === 'MINERS' ? '탐사대 승리' : '교란자 승리'}</b><small>{game.players.map(player => player.nickname).join(', ')} · {new Date(game.finishedAt).toLocaleDateString('ko-KR')}</small></li>)}</ul> : <p className="muted">게임을 마치면 결과가 남습니다.</p>}</div>
    </div>
  </section>;
}
