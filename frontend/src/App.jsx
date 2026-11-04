import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import AnomalyMonitor from './AnomalyMonitor.jsx';
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays,
  ChartNoAxesCombined, CircleDollarSign, Database, Download, Gauge,
  Globe2, Landmark, LayoutDashboard, RefreshCw, TrendingUp, Wallet
} from 'lucide-react';
import InflationForecast from "./InflationForecast.jsx";
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'fx', label: 'Exchange & Inflation', icon: TrendingUp },
  { id: 'statistics', label: 'Statistical Analysis', icon: ChartNoAxesCombined },
  { id: 'economy', label: 'Economic Indicators', icon: Landmark },
  { id: "inflation", label: "Inflation Prediction", icon: TrendingUp },
  { id: 'anomalies', label: 'Anomaly Detection', icon: Activity },
];
const METRICS = [
  { key: 'CPI_Inflation', label: 'CPI inflation', unit: '%', color: '#79a7ff' },
  { key: 'WPI_Inflation', label: 'WPI inflation', unit: '%', color: '#4bd6b0' },
  { key: 'FX_YoY_Change', label: 'INR/USD yearly change', unit: '%', color: '#ffb86b' },
  { key: 'IIP_YoY_Growth', label: 'Industrial production growth', unit: '%', color: '#c6a4ff' },
];
const INDICATORS = [
  ['IIP_General', 'Industrial production index', 'index'],
  ['IIP_YoY_Growth', 'Industrial production growth', '%'],
  ['Total_INR_Crore', 'Forex reserves (₹ crore)', '₹ crore'],
  ['Total_USD_Million', 'Forex reserves (US$ million)', '$ million'],
  ['EUR_Average', 'EUR average rate', '₹'],
  ['GBP_Average', 'GBP average rate', '₹'],
  ['JPY_Average', 'JPY average rate', '₹'],
  ['SDR_Average', 'SDR average rate', '₹'],
];
const fmt = (v, digits = 2) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const monthLabel = (date) => date ? new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '';
const niceDate = (date) => date ? new Date(`${String(date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'No date';

function useApi(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    fetch(`${API}${path}`).then(r => { if (!r.ok) throw new Error(`API returned ${r.status}`); return r.json(); })
      .then(data => { if (alive) setState({ data, loading: false, error: '' }); })
      .catch(err => { if (alive) setState({ data: null, loading: false, error: err.message }); });
    return () => { alive = false; };
  }, [path, reload]);
  return { ...state, refresh: () => setReload(x => x + 1) };
}

function Card({ title, subtitle, action, children, className = '' }) {
  return <section className={`panel ${className}`}><div className="panel-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function Empty({ loading, error, refresh }) {
  return <div className="empty-state"><div className="empty-icon">{error ? <Database size={21} /> : <RefreshCw size={21} className={loading ? 'spin' : ''} />}</div><strong>{error ? 'Backend connection needed' : loading ? 'Loading economic data…' : 'No observations available'}</strong><p>{error ? `Could not reach ${API}. Start the R API and refresh this page.` : loading ? 'RupeeWatch is fetching the latest available observations.' : 'Try a wider date range or another indicator.'}</p>{error && <button className="button secondary" onClick={refresh}><RefreshCw size={14} /> Retry</button>}</div>;
}
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tip"><span className="tip-date">{niceDate(label)}</span>{payload.map((p, i) => <div key={i} className="tip-row"><i style={{ background: p.color || p.stroke }} /><span>{p.name}</span><b>{fmt(p.value)}</b></div>)}</div>;
}
function MetricCard({ label, value, unit, date, icon: Icon, tone, trend }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><div className="metric-label">{label}</div><div className="metric-value">{value}<span>{unit}</span></div><div className="metric-foot"><span>{date ? `Latest · ${niceDate(date)}` : 'Latest available'}</span>{trend != null && <span className={trend >= 0 ? 'positive' : 'negative'}>{trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{fmt(Math.abs(trend))}%</span>}</div></div>;
}
function LineChartPanel({ title, subtitle, data, lines, height = 300, yLabel, action }) {
  const valid = data?.filter(d => d.Date) || [];
  return <Card title={title} subtitle={subtitle} action={action}>
    {valid.length ? <div style={{ height }}><ResponsiveContainer width="100%" height="100%"><LineChart data={valid} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}><CartesianGrid strokeDasharray="3 5" stroke="var(--grid)" vertical={false} /><XAxis dataKey="Date" tickFormatter={monthLabel} minTickGap={35} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={v => fmt(v, 1)} label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 } : undefined} /><Tooltip content={<ChartTip />} /><Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted)', paddingTop: 8 }} />{lines.map(line => <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.2} dot={false} connectNulls activeDot={{ r: 4, strokeWidth: 0 }} />)}</LineChart></ResponsiveContainer></div> : <Empty loading={false} />}
  </Card>;
}
function App() {
  const [page, setPage] = useState('overview');
  const [start, setStart] = useState('2016-01-01');
  const [end, setEnd] = useState('');
  const [indicator, setIndicator] = useState('IIP_YoY_Growth');
  const [selectedInflation, setSelectedInflation] = useState(['CPI_Inflation', 'WPI_Inflation']);
  const [fxMetric, setFxMetric] = useState('INR_per_USD');
  const query = useMemo(() => { const p = new URLSearchParams(); if (start) p.set('start', start); if (end) p.set('end', end); return `/api/monthly?${p.toString()}`; }, [start, end]);
  const monthly = useApi(query);
  const overview = useApi('/api/overview');
  const regression = useApi('/api/regression');
  const moneyStock = useApi('/api/money-stock');
  const reserves = useApi('/api/reserves');
  const data = Array.isArray(monthly.data) ? monthly.data : monthly.data && typeof monthly.data === 'object' ? Object.values(monthly.data) : [];
  const sorted = useMemo(() => [...data].sort((a, b) => String(a.Date).localeCompare(String(b.Date))), [data]);
  const latest = overview.data || {};
  const selectedIndicator = INDICATORS.find(x => x[0] === indicator) || INDICATORS[0];
  const headline = [
    { label: 'CPI inflation', item: latest.cpi, unit: '%', icon: Activity, tone: 'blue' },
    { label: 'INR per US dollar', item: latest.fx, unit: '', icon: CircleDollarSign, tone: 'mint', prefix: '₹' },
    { label: 'WPI inflation', item: latest.wpi, unit: '%', icon: Gauge, tone: 'amber' },
    { label: 'IIP growth', item: latest.iip, unit: '%', icon: BarChart3, tone: 'purple' },
  ];
  const exportCsv = () => {
    if (!sorted.length) return;
    const keys = Object.keys(sorted[0]);
    const csv = [keys.join(','), ...sorted.map(row => keys.map(k => { const v = row[k] ?? ''; return `"${String(v).replaceAll('"', '""')}"`; }).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'rupeewatch-monthly-data.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const pageTitles = { overview: ['Economic intelligence, at a glance', 'A unified view of Indian inflation, currency movements and macroeconomic indicators.'], fx: ['Exchange rate & inflation', ' '], statistics: ['Statistical analysis', 'Explore relationships between macroeconomic variables. Correlation does not establish causation.'], economy: ['Economic indicators', 'Track industrial production, reserves, money supply and exchange-rate benchmarks.'], inflation: ["Inflation Prediction","Forecast India's CPI inflation for the next 1, 3, or 6 months."],anomalies: ['Anomaly detection', 'Identify unusual movements in key economic indicators.'] };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Globe2 size={23} /></div><div><div className="brand-name">Rupee<span>Watch</span></div></div></div>
      <div className="workspace-label">WORKSPACE</div><nav>{NAV.map(n => { const Icon = n.icon; return <button key={n.id} onClick={() => setPage(n.id)} className={`nav-link ${page === n.id ? 'active' : ''}`}><Icon size={17} /><span>{n.label}</span>{page === n.id && <i />}</button>; })}</nav>
      <div className="sidebar-bottom"><div className="status-card"><div className="status-line"><span className={`status-dot ${monthly.error ? 'offline' : 'online'}`} /><span>{monthly.error ? 'API disconnected' : 'Data service'}</span></div><p>{monthly.error ? 'Start the R backend to load live project data.' : 'Connected to your R API.'}</p><div className="status-endpoint">localhost:8000</div></div><div className="sidebar-foot"><span>RUPEEWATCH</span><span>v1.0</span></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{NAV.find(n => n.id === page)?.label}</strong></div><div className="top-actions"><div className="api-badge"><span className={`status-dot ${monthly.error ? 'offline' : 'online'}`} />{monthly.error ? 'Backend offline' : 'Local data API'}</div><button className="icon-button" aria-label="Refresh data" onClick={() => { monthly.refresh(); overview.refresh(); }}><RefreshCw size={16} /></button><div className="avatar">RW</div></div></header>
      <div className="page-content">{!['anomalies', 'inflation'].includes(page) && <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> INDIA · MACROECONOMIC MONITOR</div><h1>{pageTitles[page][0]}</h1><p>{pageTitles[page][1]}</p></div><div className="heading-right"><div className="period-label"><CalendarDays size={15} /> Analysis period</div><div className="date-controls"><input type="date" value={start} onChange={e => setStart(e.target.value)} aria-label="Start date" /><span>to</span><input type="date" value={end} onChange={e => setEnd(e.target.value)} aria-label="End date" /></div></div></div>}
        {monthly.error && <div className="connection-banner"><Database size={17} /><div><strong>Waiting for the R backend</strong><span>Start Plumber on port 8000, then use the refresh button. The dashboard will load the CSV-backed data.</span></div><button onClick={monthly.refresh}>Retry</button></div>}
        {page === 'overview' && <>
          <div className="section-title"><div><h2>Market snapshot</h2><p>Latest available observations from the source datasets</p></div><span className="subtle-tag"><span className="status-dot online" /> Latest available data</span></div>
          <div className="metric-grid">{headline.map((m, i) => <MetricCard key={m.label} {...m} value={m.item?.value == null ? '—' : `${m.prefix || ''}${fmt(m.item.value)}`} date={m.item?.date} />)}</div>
          <div className="content-grid overview-grid"><LineChartPanel title="Inflation pulse" subtitle="Combined CPI and WPI inflation over time" data={sorted} height={310} lines={[{ key: 'CPI_Inflation', name: 'CPI inflation', color: '#79a7ff' }, { key: 'WPI_Inflation', name: 'WPI inflation', color: '#4bd6b0' }]} /><Card title="Rupee movement" subtitle="Monthly average INR per USD"><div className="chart-summary"><span>₹</span><strong>{fmt(latest.fx?.value)}</strong><small>per US dollar</small></div><div className="mini-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={sorted.filter(d => d.INR_per_USD != null)}><defs><linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#79a7ff" stopOpacity={0.34} /><stop offset="100%" stopColor="#79a7ff" stopOpacity={0} /></linearGradient></defs><Tooltip content={<ChartTip />} /><Area type="monotone" dataKey="INR_per_USD" name="INR per USD" stroke="#79a7ff" strokeWidth={2.3} fill="url(#fxFill)" connectNulls /></AreaChart></ResponsiveContainer></div><div className="chart-bottom"><span>Monthly average</span><span>{sorted.filter(d => d.INR_per_USD != null).length} observations</span></div></Card></div>
          <div className="content-grid lower-grid"><Card title="Economic signals" subtitle="Selected growth and inflation indicators"><div className="signal-list">{METRICS.map(m => { const valid = sorted.filter(d => d[m.key] != null); const last = valid.at(-1); const prev = valid.at(-2); const change = last && prev ? Number(last[m.key]) - Number(prev[m.key]) : null; return <div className="signal-row" key={m.key}><div className="signal-mark" style={{ background: `${m.color}20`, color: m.color }}><Activity size={16} /></div><div className="signal-info"><strong>{m.label}</strong><span>{last ? niceDate(last.Date) : 'No data'}</span></div><div className="signal-value"><b>{last ? fmt(last[m.key]) : '—'}{m.unit}</b><span className={change == null ? '' : change >= 0 ? 'positive' : 'negative'}>{change == null ? '—' : `${change >= 0 ? '+' : ''}${fmt(change)}`}</span></div></div>; })}</div></Card><Card title="About this dashboard" subtitle=""><div className="insight-box"><div className="insight-icon"><Wallet size={18} /></div><div><strong>Exchange rate</strong><p>A higher INR per USD value means more rupees are needed to buy one US dollar.</p></div></div><div className="insight-box"><div className="insight-icon green"><Activity size={18} /></div><div><strong>Inflation</strong><p>CPI tracks consumer prices, while WPI tracks wholesale prices. Their movements can differ.</p></div></div><div className="insight-box"><div className="insight-icon violet"><Landmark size={18} /></div><div><strong>Economic context</strong><p>Indicators have different frequencies and coverage. Compare aligned periods and avoid causal claims from correlation alone.</p></div></div></Card></div>
        </>}
        {page === 'fx' && <><div className="filter-row"><label>Exchange-rate measure<select value={fxMetric} onChange={e => setFxMetric(e.target.value)}><option value="INR_per_USD">INR per USD</option><option value="FX_YoY_Change">Year-over-year change (%)</option><option value="FX_MoM_Change">Month-over-month change (%)</option></select></label></div><LineChartPanel title="Exchange-rate trend" subtitle="Monthly series, filtered by your selected analysis period" data={sorted} height={340} yLabel={fxMetric === 'INR_per_USD' ? '₹ per USD' : 'Change (%)'} lines={[{ key: fxMetric, name: ({ INR_per_USD: 'INR per USD', FX_YoY_Change: 'YoY change (%)', FX_MoM_Change: 'MoM change (%)' })[fxMetric], color: '#79a7ff' }]} /><br></br><div className="content-grid"><label>Inflation series<div className="check-pills">{[['CPI_Inflation','CPI'],['WPI_Inflation','WPI'],['Rural_Inflation','Rural CPI'],['Urban_Inflation','Urban CPI']].map(([key,label]) => <button key={key} className={selectedInflation.includes(key) ? 'pill selected' : 'pill'} onClick={() => setSelectedInflation(old => old.includes(key) ? old.filter(x => x !== key) : [...old,key])}>{label}</button>)}</div></label><br></br><LineChartPanel title="Inflation comparison" subtitle="Consumer and wholesale price inflation" data={sorted} height={320} lines={[[ 'CPI_Inflation', 'Combined CPI inflation', '#79a7ff' ], [ 'WPI_Inflation', 'WPI inflation', '#4bd6b0' ], [ 'Rural_Inflation', 'Rural CPI inflation', '#ffb86b' ], [ 'Urban_Inflation', 'Urban CPI inflation', '#c6a4ff' ]].filter(([key]) => selectedInflation.includes(key)).map(([key,name,color]) => ({ key, name, color }))} /><Card title="Latest period values" subtitle="Most recent non-missing value in selected period"><div className="latest-list">{[['INR_per_USD','INR per USD','₹'],['CPI_Inflation','Combined CPI inflation','%'],['WPI_Inflation','WPI inflation','%'],['FX_YoY_Change','INR/USD YoY change','%']].map(([key,label,unit]) => { const row = [...sorted].reverse().find(d => d[key] != null); return <div key={key}><span>{label}</span><strong>{row ? `${unit === '₹' ? '₹' : ''}${fmt(row[key])}${unit === '%' ? '%' : ''}` : '—'}</strong><small>{row ? niceDate(row.Date) : 'No observation'}</small></div>; })}</div></Card></div></>}
        {page === 'statistics' && <><div className="content-grid stats-top"></div><Card title="Correlation explorer" subtitle=""><div className="correlation-table-wrap"><table className="data-table"><thead><tr><th>Indicator</th>{METRICS.map(m => <th key={m.key}>{m.label}</th>)}</tr></thead><tbody>{METRICS.map(a => <tr key={a.key}><td>{a.label}</td>{METRICS.map(b => { const x = sorted.map(d => [Number(d[a.key]),Number(d[b.key])]).filter(pair => pair.every(Number.isFinite)); const corr = x.length > 2 ? (() => { const mx=x.reduce((s,p)=>s+p[0],0)/x.length; const my=x.reduce((s,p)=>s+p[1],0)/x.length; const nume=x.reduce((s,p)=>s+(p[0]-mx)*(p[1]-my),0); const den=Math.sqrt(x.reduce((s,p)=>s+(p[0]-mx)**2,0)*x.reduce((s,p)=>s+(p[1]-my)**2,0)); return den ? nume/den : null; })() : null; return <td key={b.key}><span className={`corr-cell ${corr == null ? '' : corr >= 0 ? 'corr-positive' : 'corr-negative'}`}>{corr == null ? '—' : fmt(corr,2)}</span></td>; })}</tr>)}</tbody></table></div><p className="table-note"></p></Card></>}
        {page === 'economy' && <><div className="filter-row"><label>Indicator<select value={indicator} onChange={e => setIndicator(e.target.value)}>{INDICATORS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><button className="button secondary" onClick={exportCsv}><Download size={15} /> Export filtered CSV</button></div><LineChartPanel title={selectedIndicator[1]} subtitle={`Unit: ${selectedIndicator[2]} · monthly indicator series`} data={sorted} height={360} lines={[{ key: indicator, name: selectedIndicator[1], color: '#79a7ff' }]} /><div className="content-grid"><Card title="Foreign-exchange reserves" subtitle="Latest monthly observations"><DataTable data={reserves.data} columns={[['Date','Month'],['Total_INR_Crore','₹ crore'],['Total_USD_Million','US$ million']]} /></Card><Card title="Money-stock components" subtitle="Annual financial-year observations"><DataTable data={moneyStock.data} columns={moneyStock.data?.length ? Object.keys(moneyStock.data[0]).slice(0,5).map(k => [k,k.replaceAll('_',' ')]) : []} /></Card></div></>}
        {page === 'inflation' && <InflationForecast />}
        {page === 'anomalies' && <AnomalyMonitor />}
      </div>
    </main>
  </div>;
}
function DataTable({ data, columns }) {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data) : [];
  if (!rows.length) return <div className="table-empty">{data == null ? 'Waiting for backend data…' : 'No records available.'}</div>;
  const cols = columns?.length ? columns : Object.keys(rows[0]).slice(0,5).map(k => [k,k]);
  return <div className="table-wrap"><table className="data-table"><thead><tr>{cols.map(([key,label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{rows.slice(-8).reverse().map((r,i) => <tr key={i}>{cols.map(([key]) => <td key={key}>{r[key] == null ? '—' : typeof r[key] === 'number' ? fmt(r[key]) : String(r[key])}</td>)}</tr>)}</tbody></table></div>;
}
export default App;
