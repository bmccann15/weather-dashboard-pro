import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ChevronLeft, ChevronRight, Home, Clock3, MapPin, Settings, Plus, Trash2, Search } from 'lucide-react';
import './styles.css';
import type { ChartMetric, HourlyPoint, Location, RiskLevel } from './types';
import { fetchWeather, findBestOutdoorWindow, formatWindDirection, fullHourLabel, hourLabel, riskFromWetBulb, riskIcon, riskLabel, searchLocations } from './weather';
import { loadLocations, saveLocations } from './storage';

const chartLabels: Record<ChartMetric, string> = {
  temp: 'Temperature',
  feelsLike: 'Feels Like',
  wetBulb: 'Wet Bulb',
  dewpoint: 'Dewpoint',
  humidity: 'Humidity',
  windSpeed: 'Wind',
  uv: 'UV Index',
};

function App() {
  const [locations, setLocations] = useState<Location[]>(loadLocations);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tab, setTab] = useState<'home'|'hourly'|'locations'|'settings'>('home');
  const [points, setPoints] = useState<HourlyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedHour, setSelectedHour] = useState(0);
  const activeLocation = locations[activeIndex] ?? locations[0];

  useEffect(() => saveLocations(locations), [locations]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchWeather(activeLocation)
      .then(data => {
        if (cancelled) return;
        setPoints(data);
        const now = new Date();
        const idx = data.findIndex(p => new Date(p.time) >= now);
        setSelectedHour(idx >= 0 ? idx : 0);
      })
      .catch(e => !cancelled && setError(e.message || 'Weather failed to load'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [activeLocation.id]);

  const current = points[selectedHour] ?? points[0];

  function updateLocations(next: Location[]) {
    setLocations(next);
    if (activeIndex >= next.length) setActiveIndex(Math.max(0, next.length - 1));
  }

  return <div className="app-shell">
    <header className="app-header">
      <div>
        <p className="eyebrow">Weather Dashboard Pro</p>
        <h1>{tab === 'home' ? 'Dashboard' : tab[0].toUpperCase() + tab.slice(1)}</h1>
      </div>
      <LocationSwitcher locations={locations} activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
    </header>

    {loading && <div className="notice">Loading latest Open-Meteo forecast…</div>}
    {error && <div className="notice error">{error}</div>}

    <main>
      {tab === 'home' && current && <HomeScreen point={current} points={points} />}
      {tab === 'hourly' && <HourlyScreen points={points} selectedHour={selectedHour} setSelectedHour={setSelectedHour} />}
      {tab === 'locations' && <LocationsScreen locations={locations} activeIndex={activeIndex} setActiveIndex={setActiveIndex} updateLocations={updateLocations} />}
      {tab === 'settings' && <SettingsScreen />}
    </main>

    <nav className="bottom-nav">
      <NavButton label="Home" active={tab==='home'} onClick={() => setTab('home')} icon={<Home size={20}/>} />
      <NavButton label="Hourly" active={tab==='hourly'} onClick={() => setTab('hourly')} icon={<Clock3 size={20}/>} />
      <NavButton label="Locations" active={tab==='locations'} onClick={() => setTab('locations')} icon={<MapPin size={20}/>} />
      <NavButton label="Settings" active={tab==='settings'} onClick={() => setTab('settings')} icon={<Settings size={20}/>} />
    </nav>
  </div>;
}

function LocationSwitcher({ locations, activeIndex, setActiveIndex }: { locations: Location[]; activeIndex: number; setActiveIndex: (n: number)=>void }) {
  const active = locations[activeIndex];
  return <div className="location-switcher">
    <button aria-label="Previous location" onClick={() => setActiveIndex((activeIndex - 1 + locations.length) % locations.length)}><ChevronLeft size={18}/></button>
    <span>📍 {active?.name ?? 'Location'}</span>
    <button aria-label="Next location" onClick={() => setActiveIndex((activeIndex + 1) % locations.length)}><ChevronRight size={18}/></button>
  </div>;
}

function HomeScreen({ point, points }: { point: HourlyPoint; points: HourlyPoint[] }) {
  const risk = riskFromWetBulb(point.wetBulb);
  return <section className="stack">
    <RiskBanner risk={risk} />
    <div className="hero-card">
      <div>
        <p className="muted">Currently</p>
        <div className="temp">{point.temp}°</div>
        <p className="feels">Feels like {point.feelsLike}°</p>
      </div>
      <div className="best-window">
        <p>Best Outdoor Window</p>
        <strong>{findBestOutdoorWindow(points)}</strong>
      </div>
    </div>
    <div className="metric-grid">
      <Metric label="Wet Bulb" value={`${point.wetBulb}°`} />
      <Metric label="Dewpoint" value={`${point.dewpoint}°`} />
      <Metric label="Wind" value={`${formatWindDirection(point.windDirection)} ${point.windSpeed} mph`} />
      <Metric label="UV" value={`${point.uv}`} />
      <Metric label="Humidity" value={`${point.humidity}%`} />
      <Metric label="AQI" value={point.aqi != null ? `${point.aqi}` : '—'} />
    </div>
    <WhyCard point={point} />
  </section>;
}

function RiskBanner({ risk }: { risk: RiskLevel }) {
  return <div className={`risk-banner risk-${risk}`}><span>{riskIcon(risk)}</span><strong>{riskLabel(risk)}</strong></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}

function WhyCard({ point }: { point: HourlyPoint }) {
  const reasons = [];
  if (point.wetBulb >= 78) reasons.push(`Wet bulb is elevated at ${point.wetBulb}°`);
  if (point.uv >= 8) reasons.push(`UV index is very high at ${point.uv}`);
  if (point.windSpeed <= 5) reasons.push(`Wind is light at ${point.windSpeed} mph`);
  if (point.dewpoint >= 68) reasons.push(`Dewpoint is muggy at ${point.dewpoint}°`);
  if (!reasons.length) reasons.push('Wet bulb, UV, dewpoint, and wind are all in a manageable range.');
  return <details className="why-card"><summary>Why this status?</summary>{reasons.map(r => <p key={r}>✓ {r}</p>)}</details>;
}

function HourlyScreen({ points, selectedHour, setSelectedHour }: { points: HourlyPoint[]; selectedHour: number; setSelectedHour: (n: number)=>void }) {
  const [metric, setMetric] = useState<ChartMetric>('wetBulb');
  const today = useMemo(() => points.slice(0, 24), [points]);
  const selected = points[selectedHour] ?? today[0];
  if (!points.length) return <div className="notice">No hourly data yet.</div>;
  return <section className="stack">
    <h2>Today's Timeline</h2>
    <div className="timeline">{today.map((p, i) => <button key={p.time} onClick={() => setSelectedHour(i)} className={i === selectedHour ? 'selected' : ''}><span>{riskIcon(riskFromWetBulb(p.wetBulb))}</span><small>{hourLabel(p.time)}</small></button>)}</div>
    <div className="chart-picker">{(Object.keys(chartLabels) as ChartMetric[]).map(k => <button key={k} className={metric===k ? 'active' : ''} onClick={() => setMetric(k)}>{chartLabels[k]}</button>)}</div>
    <SimpleChart points={today} metric={metric} selectedIndex={Math.min(selectedHour, 23)} onSelect={setSelectedHour} />
    {selected && <div className="selected-hour-card">
      <h2>{fullHourLabel(selected.time)}</h2>
      <div className="metric-grid compact">
        <Metric label="Temp" value={`${selected.temp}°`} />
        <Metric label="Feels" value={`${selected.feelsLike}°`} />
        <Metric label="Wet Bulb" value={`${selected.wetBulb}°`} />
        <Metric label="Dewpoint" value={`${selected.dewpoint}°`} />
        <Metric label="Wind" value={`${selected.windSpeed} mph`} />
        <Metric label="UV" value={`${selected.uv}`} />
      </div>
    </div>}
  </section>;
}

function SimpleChart({ points, metric, selectedIndex, onSelect }: { points: HourlyPoint[]; metric: ChartMetric; selectedIndex: number; onSelect: (n: number)=>void }) {
  const values = points.map(p => p[metric] as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = 680, height = 220, pad = 28;
  const coords = values.map((v, i) => {
    const x = pad + i * ((width - pad * 2) / Math.max(1, values.length - 1));
    const y = height - pad - ((v - min) / Math.max(1, max - min)) * (height - pad * 2);
    return [x, y] as const;
  });
  const d = coords.map(([x,y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  const selected = coords[selectedIndex] ?? coords[0];
  return <div className="chart-card">
    <div className="chart-title"><strong>{chartLabels[metric]}</strong><span>{values[selectedIndex]}{metric === 'humidity' ? '%' : metric === 'windSpeed' ? ' mph' : metric === 'uv' ? '' : '°'}</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${chartLabels[metric]} hourly chart`}>
      <line x1={pad} y1={height-pad} x2={width-pad} y2={height-pad} className="axis" />
      <path d={d} className="line" />
      {coords.map(([x,y], i) => <circle key={i} cx={x} cy={y} r={i===selectedIndex ? 6 : 3} className={i===selectedIndex ? 'dot selected-dot' : 'dot'} onClick={() => onSelect(i)} />)}
      {selected && <line x1={selected[0]} y1={pad} x2={selected[0]} y2={height-pad} className="selector" />}
    </svg>
  </div>;
}

function LocationsScreen({ locations, activeIndex, setActiveIndex, updateLocations }: { locations: Location[]; activeIndex: number; setActiveIndex: (n:number)=>void; updateLocations: (l:Location[])=>void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  async function runSearch() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try { setResults(await searchLocations(query)); } finally { setSearching(false); }
  }
  return <section className="stack">
    <div className="search-row"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder="Search city or place" /><button onClick={runSearch}><Search size={18}/> Search</button></div>
    {searching && <p className="muted">Searching…</p>}
    {results.map(r => <div className="location-row" key={r.id}><div><strong>{r.name}</strong><p>{[r.admin1, r.country].filter(Boolean).join(', ')}</p></div><button onClick={() => updateLocations([...locations, { ...r, id: `${r.id}-${Date.now()}` }])}><Plus size={18}/> Add</button></div>)}
    <h2>Saved Locations</h2>
    {locations.map((l, i) => <div className={`location-row ${i===activeIndex ? 'active-location' : ''}`} key={l.id} onClick={() => setActiveIndex(i)}><div><strong>{l.name}</strong><p>{[l.admin1, l.country].filter(Boolean).join(', ')}</p></div>{locations.length > 1 && <button className="ghost" onClick={(e) => { e.stopPropagation(); updateLocations(locations.filter((_, idx) => idx !== i)); }}><Trash2 size={18}/></button>}</div>)}
  </section>;
}

function SettingsScreen() {
  return <section className="stack"><div className="settings-card"><h2>Settings</h2><p>V4 uses °F, mph, and 12-hour time by default.</p><p className="muted">Future: unit toggles, notifications, personal thresholds, dark-mode toggle, and Coach Mode.</p></div><div className="settings-card"><h2>Data</h2><p>Forecast and air quality data are fetched directly from Open-Meteo in the browser. Saved locations are stored locally on this device.</p></div></section>;
}

function NavButton({ label, active, onClick, icon }: { label: string; active: boolean; onClick: ()=>void; icon: React.ReactNode }) {
  return <button className={active ? 'active' : ''} onClick={onClick}>{icon}<span>{label}</span></button>;
}

createRoot(document.getElementById('root')!).render(<App />);
