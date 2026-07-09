import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CloudRain, Droplets, MapPin, Plus, RefreshCw, Snowflake, Sun, Trash2, Umbrella } from 'lucide-react';
import './styles.css';

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type HourPoint = {
  time: string;
  temp: number;
  dewPoint: number;
  humidity: number;
  precipProb: number;
  precip: number;
  rain: number;
  showers: number;
  snow: number;
  weatherCode: number;
};

type DayPoint = {
  date: string;
  tempMax: number;
  tempMin: number;
  precipSum: number;
  rainSum: number;
  showersSum: number;
  snowSum: number;
  precipProbMax: number;
  weatherCode: number;
};

type WeatherData = {
  location: Location;
  fetchedAt: string;
  timezone: string;
  hourly: HourPoint[];
  daily: DayPoint[];
};

const DEFAULT_LOCATIONS: Location[] = [
  { id: 'groton-ma', name: 'Groton, MA', latitude: 42.6112, longitude: -71.5745 },
  { id: 'concord-ma', name: 'Concord, MA', latitude: 42.4604, longitude: -71.3489 },
];

const STORAGE_KEY = 'weather-dashboard-pro-locations-v2';

function loadLocations(): Location[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOCATIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LOCATIONS;
  } catch {
    return DEFAULT_LOCATIONS;
  }
}

function saveLocations(locations: Location[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
}

function f(c: number) {
  return Math.round((c * 9) / 5 + 32);
}

function inches(mm: number) {
  return mm / 25.4;
}

function formatInches(mm: number) {
  const value = inches(mm);
  if (value < 0.005) return '0.00"';
  return `${value.toFixed(2)}"`;
}

function weatherLabel(code: number) {
  if ([0].includes(code)) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Clouds';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storms';
  return 'Weather';
}

function precipRisk(prob: number, amountMm: number, snowMm: number) {
  if (snowMm > 2) return { label: 'Snow likely', level: 'snow' };
  if (amountMm >= 5 || prob >= 80) return { label: 'Wet', level: 'high' };
  if (amountMm >= 1 || prob >= 50) return { label: 'Showers possible', level: 'medium' };
  return { label: 'Mostly dry', level: 'low' };
}

function describeNextRain(hours: HourPoint[]) {
  const next = hours.slice(0, 12).find(h => h.precipProb >= 50 || h.precip >= 0.5 || h.snow >= 0.5);
  if (!next) return 'Mostly dry for the next 12 hours';
  const diffHours = Math.max(0, Math.round((new Date(next.time).getTime() - Date.now()) / 36e5));
  if (next.snow >= 0.5) return diffHours <= 1 ? 'Snow possible soon' : `Snow possible in ~${diffHours} hours`;
  return diffHours <= 1 ? 'Rain possible soon' : `Rain possible in ~${diffHours} hours`;
}

function bestDryWindow(hours: HourPoint[]) {
  const daylight = hours.slice(0, 24).filter(h => {
    const hour = new Date(h.time).getHours();
    return hour >= 7 && hour <= 21;
  });

  let bestStart = 0;
  let bestLen = 0;
  let currentStart = 0;
  let currentLen = 0;

  daylight.forEach((h, i) => {
    const dry = h.precipProb < 35 && h.precip < 0.3 && h.snow < 0.3;
    if (dry) {
      if (currentLen === 0) currentStart = i;
      currentLen += 1;
      if (currentLen > bestLen) {
        bestLen = currentLen;
        bestStart = currentStart;
      }
    } else {
      currentLen = 0;
    }
  });

  if (bestLen < 2) return 'No clear dry window';
  const start = new Date(daylight[bestStart].time);
  const end = new Date(daylight[bestStart + bestLen - 1].time);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric' };
  return `${start.toLocaleTimeString([], opts)}–${end.toLocaleTimeString([], opts)}`;
}

async function fetchWeather(location: Location): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    temperature_unit: 'celsius',
    forecast_days: '7',
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_probability_max',
      'weather_code',
    ].join(','),
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Forecast failed for ${location.name}`);
  const data = await response.json();

  const hourly: HourPoint[] = data.hourly.time.map((time: string, i: number) => ({
    time,
    temp: data.hourly.temperature_2m[i],
    humidity: data.hourly.relative_humidity_2m[i],
    dewPoint: data.hourly.dew_point_2m[i],
    precipProb: data.hourly.precipitation_probability?.[i] ?? 0,
    precip: data.hourly.precipitation?.[i] ?? 0,
    rain: data.hourly.rain?.[i] ?? 0,
    showers: data.hourly.showers?.[i] ?? 0,
    snow: data.hourly.snowfall?.[i] ?? 0,
    weatherCode: data.hourly.weather_code?.[i] ?? 0,
  }));

  const daily: DayPoint[] = data.daily.time.map((date: string, i: number) => ({
    date,
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipSum: data.daily.precipitation_sum?.[i] ?? 0,
    rainSum: data.daily.rain_sum?.[i] ?? 0,
    showersSum: data.daily.showers_sum?.[i] ?? 0,
    snowSum: data.daily.snowfall_sum?.[i] ?? 0,
    precipProbMax: data.daily.precipitation_probability_max?.[i] ?? 0,
    weatherCode: data.daily.weather_code?.[i] ?? 0,
  }));

  return {
    location,
    fetchedAt: new Date().toISOString(),
    timezone: data.timezone,
    hourly,
    daily,
  };
}

function RainBars({ hours }: { hours: HourPoint[] }) {
  const next = hours.slice(0, 12);
  return (
    <div className="rain-bars">
      {next.map(h => {
        const height = Math.max(8, Math.min(60, h.precipProb * 0.6));
        return (
          <div className="rain-bar-wrap" key={h.time}>
            <div className="rain-bar" style={{ height }} title={`${h.precipProb}% / ${formatInches(h.precip)}`} />
            <span>{new Date(h.time).getHours()}</span>
          </div>
        );
      })}
    </div>
  );
}

function WeatherCard({ data }: { data: WeatherData }) {
  const current = data.hourly.find(h => new Date(h.time).getTime() >= Date.now()) ?? data.hourly[0];
  const today = data.daily[0];
  const risk = precipRisk(today.precipProbMax, today.precipSum, today.snowSum);
  const nextRain = describeNextRain(data.hourly);
  const dryWindow = bestDryWindow(data.hourly);

  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h2><MapPin size={18} /> {data.location.name}</h2>
          <p className="muted">Updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
        <div className={`risk ${risk.level}`}>{risk.label}</div>
      </div>

      <div className="hero-grid">
        <div className="hero-number">
          <span>{f(current.temp)}°</span>
          <small>{weatherLabel(current.weatherCode)}</small>
        </div>

        <div className="metric">
          <Droplets size={18} />
          <div>
            <strong>{f(current.dewPoint)}°</strong>
            <small>Dew point</small>
          </div>
        </div>

        <div className="metric">
          <Umbrella size={18} />
          <div>
            <strong>{current.precipProb}%</strong>
            <small>Now rain risk</small>
          </div>
        </div>

        <div className="metric">
          {today.snowSum > 1 ? <Snowflake size={18} /> : <CloudRain size={18} />}
          <div>
            <strong>{formatInches(today.precipSum)}</strong>
            <small>Today total</small>
          </div>
        </div>
      </div>

      <div className="summary-row">
        <div>
          <span>Next</span>
          <strong>{nextRain}</strong>
        </div>
        <div>
          <span>Best dry window</span>
          <strong>{dryWindow}</strong>
        </div>
        <div>
          <span>Today</span>
          <strong>{today.precipProbMax}% · {formatInches(today.precipSum)}</strong>
        </div>
      </div>

      <RainBars hours={data.hourly} />

      <div className="daily">
        {data.daily.slice(0, 5).map(day => {
          const dayRisk = precipRisk(day.precipProbMax, day.precipSum, day.snowSum);
          return (
            <div className="day" key={day.date}>
              <strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</strong>
              <span>{f(day.tempMax)}°/{f(day.tempMin)}°</span>
              <span>{day.precipProbMax}%</span>
              <span>{formatInches(day.precipSum)}</span>
              <em className={`dot ${dayRisk.level}`}></em>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function AddLocation({ onAdd }: { onAdd: (loc: Location) => void }) {
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  return (
    <form className="add-location" onSubmit={(e) => {
      e.preventDefault();
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (!name.trim() || Number.isNaN(latitude) || Number.isNaN(longitude)) return;
      onAdd({
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        name: name.trim(),
        latitude,
        longitude,
      });
      setName('');
      setLat('');
      setLon('');
    }}>
      <input placeholder="Location name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Latitude" value={lat} onChange={e => setLat(e.target.value)} />
      <input placeholder="Longitude" value={lon} onChange={e => setLon(e.target.value)} />
      <button><Plus size={16} /> Add</button>
    </form>
  );
}

function App() {
  const [locations, setLocations] = useState<Location[]>(loadLocations);
  const [weather, setWeather] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sortedWeather = useMemo(() => weather.sort((a, b) => a.location.name.localeCompare(b.location.name)), [weather]);

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const results = await Promise.all(locations.map(fetchWeather));
      setWeather(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load weather');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    saveLocations(locations);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  return (
    <main>
      <header className="app-header">
        <div>
          <p className="eyebrow"><Sun size={16} /> Weather Dashboard Pro</p>
          <h1>Now with precipitation planning</h1>
          <p>Rain risk, daily totals, next-rain timing, and best dry windows for every saved location.</p>
        </div>
        <button className="refresh" onClick={refresh} disabled={loading}>
          <RefreshCw size={17} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </header>

      <AddLocation onAdd={(loc) => setLocations(prev => [...prev, loc])} />

      {error && <div className="error">{error}</div>}

      <section className="cards">
        {sortedWeather.map(item => <WeatherCard data={item} key={item.location.id} />)}
      </section>

      <section className="manage">
        <h3>Saved locations</h3>
        {locations.map(loc => (
          <button key={loc.id} onClick={() => setLocations(prev => prev.filter(x => x.id !== loc.id))}>
            <Trash2 size={15} /> Remove {loc.name}
          </button>
        ))}
      </section>

      <footer>
        Weather data from Open-Meteo. Precipitation totals are shown in inches; temperatures are shown in °F.
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
