import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Cloud,
  CloudRain,
  Droplets,
  Gauge,
  MapPin,
  Plus,
  RefreshCw,
  Snowflake,
  Sun,
  Thermometer,
  Trash2,
  Umbrella,
  Waves,
  Wind
} from 'lucide-react';
import './styles.css';

type Location = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type HourPoint = {
  time: string;
  tempC: number;
  humidity: number;
  dewPointC: number;
  apparentC: number;
  windMph: number;
  cloudCover: number;
  precipProb: number;
  precipMm: number;
  rainMm: number;
  showersMm: number;
  snowCm: number;
  weatherCode: number;
};

type DayPoint = {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipSumMm: number;
  rainSumMm: number;
  showersSumMm: number;
  snowSumCm: number;
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

const APP_VERSION = 'v5.0.0';

const DEFAULT_LOCATIONS: Location[] = [
  { id: 'groton-ma', name: 'Groton, MA', latitude: 42.6112, longitude: -71.5745 },
  { id: 'concord-ma', name: 'Concord, MA', latitude: 42.4604, longitude: -71.3489 },
  { id: 'cuttyhunk-ma', name: 'Cuttyhunk, MA', latitude: 41.4251, longitude: -70.9267 }
];

const STORAGE_KEY = 'weather-dashboard-pro-locations-v5';

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

function formatInchesFromMm(mm: number) {
  const inches = mm / 25.4;
  if (inches < 0.005) return '0.00"';
  return `${inches.toFixed(2)}"`;
}

function formatSnowFromCm(cm: number) {
  const inches = cm / 2.54;
  if (inches < 0.05) return '0.0"';
  return `${inches.toFixed(1)}"`;
}

// Stull wet-bulb approximation. Good for dashboard planning guidance.
function wetBulbC(tempC: number, rh: number) {
  const t = tempC;
  const r = Math.max(1, Math.min(100, rh));
  return (
    t * Math.atan(0.151977 * Math.sqrt(r + 8.313659)) +
    Math.atan(t + r) -
    Math.atan(r - 1.676331) +
    0.00391838 * Math.pow(r, 1.5) * Math.atan(0.023101 * r) -
    4.686035
  );
}

function comfortCategory(wetBulbF: number, dewF: number, tempF: number) {
  if (wetBulbF >= 84 || dewF >= 78 || tempF >= 95) return { label: 'High heat stress', level: 'danger' };
  if (wetBulbF >= 78 || dewF >= 72 || tempF >= 88) return { label: 'Caution', level: 'watch' };
  if (wetBulbF >= 70 || dewF >= 65) return { label: 'Humid', level: 'medium' };
  return { label: 'Comfortable', level: 'good' };
}

function precipRisk(prob: number, amountMm: number, snowCm: number) {
  if (snowCm > 1) return { label: 'Snow likely', level: 'snow' };
  if (amountMm >= 5 || prob >= 80) return { label: 'Wet', level: 'danger' };
  if (amountMm >= 1 || prob >= 50) return { label: 'Showers possible', level: 'watch' };
  return { label: 'Mostly dry', level: 'good' };
}

function weatherLabel(code: number) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Clouds';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Storms';
  return 'Weather';
}

function currentHour(hours: HourPoint[]) {
  return hours.find(h => new Date(h.time).getTime() >= Date.now()) ?? hours[0];
}

function upcomingHours(hours: HourPoint[], count = 12) {
  return hours.filter(h => new Date(h.time).getTime() >= Date.now()).slice(0, count);
}

function describeNextPrecip(hours: HourPoint[]) {
  const future = upcomingHours(hours, 24);
  const next = future.find(h => h.precipProb >= 50 || h.precipMm >= 0.5 || h.snowCm >= 0.5);
  if (!next) return 'Mostly dry for the next 24 hours';

  const diffHours = Math.max(0, Math.round((new Date(next.time).getTime() - Date.now()) / 36e5));
  const kind = next.snowCm >= 0.5 ? 'Snow' : 'Rain';
  return diffHours <= 1 ? `${kind} possible soon` : `${kind} possible in ~${diffHours} hours`;
}

function bestDryWindow(hours: HourPoint[]) {
  const daylight = upcomingHours(hours, 36).filter(h => {
    const hour = new Date(h.time).getHours();
    return hour >= 7 && hour <= 21;
  });

  let bestStart = 0;
  let bestLen = 0;
  let currentStart = 0;
  let currentLen = 0;

  daylight.forEach((h, i) => {
    const dry = h.precipProb < 35 && h.precipMm < 0.3 && h.snowCm < 0.3;
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

  if (bestLen < 2) return 'No obvious dry window';
  const start = new Date(daylight[bestStart].time);
  const end = new Date(daylight[bestStart + bestLen - 1].time);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric' };
  return `${start.toLocaleTimeString([], opts)}–${end.toLocaleTimeString([], opts)}`;
}

function activitySuggestion(current: HourPoint, today: DayPoint) {
  const wbF = f(wetBulbC(current.tempC, current.humidity));
  if (today.snowSumCm > 1) return 'Snow gear / extra travel time';
  if (today.precipProbMax >= 70 || today.precipSumMm >= 4) return 'Bring rain gear';
  if (wbF >= 78 || f(current.dewPointC) >= 72) return 'Hydrate and take breaks';
  if (current.windMph >= 18) return 'Windy conditions';
  return 'Good general outdoor window';
}

async function fetchWeather(location: Location): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'auto',
    forecast_days: '7',
    wind_speed_unit: 'mph',
    temperature_unit: 'celsius',
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'apparent_temperature',
      'wind_speed_10m',
      'cloud_cover',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'snowfall',
      'weather_code'
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'rain_sum',
      'showers_sum',
      'snowfall_sum',
      'precipitation_probability_max',
      'weather_code'
    ].join(','),
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`Forecast failed for ${location.name}`);
  const data = await response.json();

  const hourly: HourPoint[] = data.hourly.time.map((time: string, i: number) => ({
    time,
    tempC: data.hourly.temperature_2m[i],
    humidity: data.hourly.relative_humidity_2m[i],
    dewPointC: data.hourly.dew_point_2m[i],
    apparentC: data.hourly.apparent_temperature[i],
    windMph: data.hourly.wind_speed_10m[i],
    cloudCover: data.hourly.cloud_cover[i],
    precipProb: data.hourly.precipitation_probability?.[i] ?? 0,
    precipMm: data.hourly.precipitation?.[i] ?? 0,
    rainMm: data.hourly.rain?.[i] ?? 0,
    showersMm: data.hourly.showers?.[i] ?? 0,
    snowCm: data.hourly.snowfall?.[i] ?? 0,
    weatherCode: data.hourly.weather_code?.[i] ?? 0,
  }));

  const daily: DayPoint[] = data.daily.time.map((date: string, i: number) => ({
    date,
    tempMaxC: data.daily.temperature_2m_max[i],
    tempMinC: data.daily.temperature_2m_min[i],
    precipSumMm: data.daily.precipitation_sum?.[i] ?? 0,
    rainSumMm: data.daily.rain_sum?.[i] ?? 0,
    showersSumMm: data.daily.showers_sum?.[i] ?? 0,
    snowSumCm: data.daily.snowfall_sum?.[i] ?? 0,
    precipProbMax: data.daily.precipitation_probability_max?.[i] ?? 0,
    weatherCode: data.daily.weather_code?.[i] ?? 0,
  }));

  return { location, fetchedAt: new Date().toISOString(), timezone: data.timezone, hourly, daily };
}

function RainBars({ hours }: { hours: HourPoint[] }) {
  const next = upcomingHours(hours, 12);
  return (
    <div className="rain-bars">
      {next.map(h => {
        const height = Math.max(8, Math.min(66, h.precipProb * 0.66));
        return (
          <div className="rain-bar-wrap" key={h.time}>
            <div className="rain-bar" style={{ height }} title={`${h.precipProb}% / ${formatInchesFromMm(h.precipMm)}`} />
            <span>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</span>
          </div>
        );
      })}
    </div>
  );
}

function HourlyTable({ hours }: { hours: HourPoint[] }) {
  const next = upcomingHours(hours, 12);
  return (
    <div className="hourly-table">
      <div className="hourly-head">
        <span>Time</span><span>Temp</span><span>Dew</span><span>WB</span><span>Rain</span><span>Amt</span><span>Wind</span>
      </div>
      {next.map(h => {
        const wbF = f(wetBulbC(h.tempC, h.humidity));
        return (
          <div className="hourly-row" key={h.time}>
            <span>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</span>
            <strong>{f(h.tempC)}°</strong>
            <span>{f(h.dewPointC)}°</span>
            <span>{wbF}°</span>
            <span>{h.precipProb}%</span>
            <span>{h.snowCm >= 0.5 ? formatSnowFromCm(h.snowCm) : formatInchesFromMm(h.precipMm)}</span>
            <span>{Math.round(h.windMph)} mph</span>
          </div>
        );
      })}
    </div>
  );
}

function WeatherCard({ data }: { data: WeatherData }) {
  const now = currentHour(data.hourly);
  const today = data.daily[0];
  const wbF = f(wetBulbC(now.tempC, now.humidity));
  const comfort = comfortCategory(wbF, f(now.dewPointC), f(now.tempC));
  const rainRisk = precipRisk(today.precipProbMax, today.precipSumMm, today.snowSumCm);
  const suggestion = activitySuggestion(now, today);

  return (
    <article className="card">
      <div className="card-top">
        <div>
          <h2><MapPin size={18} /> {data.location.name}</h2>
          <p className="muted">Updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
        </div>
        <div className="badges">
          <span className={`badge ${comfort.level}`}>{comfort.label}</span>
          <span className={`badge ${rainRisk.level}`}>{rainRisk.label}</span>
        </div>
      </div>

      <div className="hero-grid">
        <div className="hero-number">
          <span>{f(now.tempC)}°</span>
          <small>{weatherLabel(now.weatherCode)} · feels {f(now.apparentC)}°</small>
        </div>

        <div className="metric">
          <Droplets size={18} />
          <div><strong>{f(now.dewPointC)}°</strong><small>Dew point</small></div>
        </div>

        <div className="metric">
          <Waves size={18} />
          <div><strong>{wbF}°</strong><small>Wet bulb</small></div>
        </div>

        <div className="metric">
          <Thermometer size={18} />
          <div><strong>{now.humidity}%</strong><small>Humidity</small></div>
        </div>

        <div className="metric">
          <Wind size={18} />
          <div><strong>{Math.round(now.windMph)} mph</strong><small>Wind</small></div>
        </div>

        <div className="metric">
          <Umbrella size={18} />
          <div><strong>{now.precipProb}%</strong><small>Now precip</small></div>
        </div>

        <div className="metric">
          {today.snowSumCm > 1 ? <Snowflake size={18} /> : <CloudRain size={18} />}
          <div><strong>{today.snowSumCm > 1 ? formatSnowFromCm(today.snowSumCm) : formatInchesFromMm(today.precipSumMm)}</strong><small>Today total</small></div>
        </div>
      </div>

      <div className="summary-row">
        <div><span>Next precip</span><strong>{describeNextPrecip(data.hourly)}</strong></div>
        <div><span>Best dry window</span><strong>{bestDryWindow(data.hourly)}</strong></div>
        <div><span>Today chance</span><strong>{today.precipProbMax}%</strong></div>
        <div><span>Outdoor note</span><strong>{suggestion}</strong></div>
        <div><span>Cloud cover</span><strong>{Math.round(now.cloudCover)}%</strong></div>
        <div><span>Today high/low</span><strong>{f(today.tempMaxC)}° / {f(today.tempMinC)}°</strong></div>
      </div>

      <section className="panel">
        <h3>Next 12 hours rain risk</h3>
        <RainBars hours={data.hourly} />
      </section>

      <section className="panel">
        <h3>Hourly details</h3>
        <HourlyTable hours={data.hourly} />
      </section>

      <section className="panel">
        <h3>5-day outlook</h3>
        <div className="daily">
          {data.daily.slice(0, 5).map(day => {
            const dayRisk = precipRisk(day.precipProbMax, day.precipSumMm, day.snowSumCm);
            return (
              <div className="day" key={day.date}>
                <strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</strong>
                <span>{f(day.tempMaxC)}°/{f(day.tempMinC)}°</span>
                <span>{weatherLabel(day.weatherCode)}</span>
                <span>{day.precipProbMax}%</span>
                <span>{day.snowSumCm > 1 ? formatSnowFromCm(day.snowSumCm) : formatInchesFromMm(day.precipSumMm)}</span>
                <em className={`dot ${dayRisk.level}`}></em>
              </div>
            );
          })}
        </div>
      </section>
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

  const sortedWeather = useMemo(
    () => [...weather].sort((a, b) => a.location.name.localeCompare(b.location.name)),
    [weather]
  );

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
          <p className="eyebrow"><Sun size={16} /> Weather Dashboard Pro <span>{APP_VERSION}</span></p>
          <h1>Heat, humidity, wet bulb, hourly weather, and precipitation planning.</h1>
          <p>Track comfort, dew point, wet bulb, rain/snow risk, hourly details, best dry windows, and 5-day outlooks for saved locations.</p>
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
        Weather data from Open-Meteo. Wet bulb uses an approximate formula for planning guidance. {APP_VERSION}
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
