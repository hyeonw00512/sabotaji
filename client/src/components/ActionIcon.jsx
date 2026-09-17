const tool = { PICK:'⛏', CART:'▰', LAMP:'✦' };

export function ActionIcon({ action, equipment, equipmentOptions = [] }) {
  const tools = equipmentOptions.length ? equipmentOptions : equipment ? [equipment] : [];
  if (action === 'REMOVE_PATH') return <svg className="action-icon rockfall-icon" viewBox="0 0 100 100" aria-hidden="true"><path d="M8 82 37 27 74 38 92 82Z"/><path className="action-crack" d="m50 21-9 27 13 1-8 27"/><circle cx="24" cy="23" r="8"/><circle cx="70" cy="16" r="6"/></svg>;
  if (action === 'PEEK_GOAL') return <svg className="action-icon map-icon" viewBox="0 0 100 100" aria-hidden="true"><path d="m14 19 24-8 25 8 23-8v69l-23 8-25-8-24 8Z"/><path className="action-line" d="M38 11v69M63 19v69"/><circle cx="51" cy="49" r="11"/><path className="action-line" d="m59 57 16 16"/></svg>;
  const broken = action === 'BREAK';
  return <svg className={`action-icon tool-icon ${broken?'broken-tool':''}`} viewBox="0 0 100 100" aria-hidden="true"><rect x="7" y="7" width="86" height="86" rx="14"/>{tools.map((kind,index) => <g key={kind} transform={`translate(${tools.length === 2 ? (index ? 52 : 22) : 38},${tools.length === 2 ? 50 : 57})`}><text textAnchor="middle">{tool[kind] || '⚒'}</text>{broken && <path className="action-crack" d="m-16-24 13 13-9 10 16 17"/>}</g>)}{!broken && <path className="repair-mark" d="m73 21 0 17m-8-8h17"/>}</svg>;
}
