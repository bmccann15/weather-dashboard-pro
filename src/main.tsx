import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Bike,
  CloudRain,
  Droplets,
  Fish,
  Gauge,
  MapPin,
  Plus,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  Trophy,
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
  uvIndex: number;
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
  uvIndexMax: number;
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

const APP_VERSION = 'v5.1.0';

const DEFAULT_LOCATIONS: Location[] = [
  { id: 'groton-ma', name: 'Groton, MA', latitude: 42.6112, longitude: -71.5745 },
  { id: 'concord-ma', name: 'Concord, MA', latitude: 42.4604, longitude: -71.3489 },
  { id: 'cuttyhunk-ma', name: 'Cuttyhunk, MA', latitude: 41.4251, longitude: -70.9267 }
];

const STORAGE_KEY = 'weather-dashboard-pro-locations-v51';

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

// Stull wet-bulb approximation. Good for planning guidance.
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

function weatherIcon(code: number) {
  if ([61, 63, 65, 66, 67, 80, 81, 82, 51, 53, 55, 56, 57].includes(code)) return '🌧';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈';
  if ([1, 2, 3, 45, 48].includes(code)) return '☁️';
  return '☀️';
}

function currentHour(hours: HourPoint[]) {
  return hours.find(h => new Date(h.time).getTime() >= Date.now()) ?? hours[0];
}

function upcomingHours(hours: HourPoint[], count = 12) {
  return hours.filter(h => new Date(h.time).getTime() >= Date.now()).slice(0, count);
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

function stormRisk(hours: HourPoint[]) {
  return upcomingHours(hours, 12).some(h => [95, 96, 99].includes(h.weatherCode));
}

function outdoorScore(current: HourPoint, today: DayPoint) {
  let score = 100;
  const tempF = f(current.tempC);
  const dewF = f(current.dewPointC);
  const wbF = f(wetBulbC(current.tempC, current.humidity));

  if (today.precipProbMax >= 80) score -= 22;
  else if (today.precipProbMax >= 60) score -= 14;
  else if (today.precipProbMax >= 40) score -= 7;

  if (today.precipSumMm >= 8) score -= 22;
  else if (today.precipSumMm >= 4) score -= 13;
  else if (today.precipSumMm >= 1) score -= 6;

  if (today.snowSumCm > 2) score -= 18;
  if ([95, 96, 99].includes(current.weatherCode)) score -= 30;

  if (wbF >= 84 || tempF >= 95) score -= 25;
  else if (wbF >= 78 || dewF >= 72 || tempF >= 88) score -= 14;
  else if (dewF >= 65) score -= 6;

  if (current.windMph >= 25) score -= 16;
  else if (current.windMph >= 18) score -= 9;

  if (current.uvIndex >= 8) score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 85 ? 'good' : score >= 68 ? 'medium' : score >= 45 ? 'watch' : 'danger';
  const label = score >= 85 ? 'Excellent' : score >= 68 ? 'Good' : score >= 45 ? 'Marginal' : 'Poor';
  return { score, level, label };
}

function describeNextPrecip(hours: HourPoint[]) {
  const future = upcomingHours(hours, 24);
  const next = future.find(h => h.precipProb >= 50 || h.precipMm >= 0.5 || h.snowCm >= 0.5);
  if (!next) return 'Mostly dry for the next 24 hours';

  const diffHours = Math.max(0, Math.round((new Date(next.time).getTime() - Date.now()) / 36e5));
  const kind = next.snowCm >= 0.5 ? 'Snow' : 'Rain';
  return diffHours <= 1 ? `${kind} possible soon` : `${kind} possible in ~${diffHours} hours`;
}

function heaviestPrecipWindow(hours: HourPoint[]) {
  const next = upcomingHours(hours, 24);
  const max = next.reduce((best, h) => (h.precipMm > best.precipMm ? h : best), next[0]);
  if (!max || max.precipMm < 0.5) return 'No meaningful peak';
  return `${new Date(max.time).toLocaleTimeString([], { hour: 'numeric' })} · ${formatInchesFromMm(max.precipMm)}`;
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

function activityGuidance(current: HourPoint, today: DayPoint, hours: HourPoint[]) {
  const score = outdoorScore(current, today).score;
  const wbF = f(wetBulbC(current.tempC, current.humidity));
  const wet = today.precipProbMax >= 60 || today.precipSumMm >= 3;
  const windy = current.windMph >= 18;
  const storm = stormRisk(hours);

  return [
    {
      icon: '🚶',
      label: 'Walking',
      status: score >= 70 && !storm ? 'Good' : score >= 45 ? 'OK with caution' : 'Not ideal',
      detail: wet ? 'Watch for wet windows' : wbF >= 78 ? 'Hydrate and shorten route' : 'Good general window'
    },
    {
      icon: '🏒',
      label: 'Hockey travel',
      status: wet || today.snowSumCm > 1 ? 'Allow extra time' : 'Normal',
      detail: today.snowSumCm > 1 ? 'Snow may slow travel' : wet ? 'Rain may affect roads' : 'No major weather travel issue'
    },
    {
      icon: '⚽',
      label: "Kids' sports",
      status: storm ? 'Watch storms' : wet ? 'Check fields' : score >= 70 ? 'Good' : 'Manage heat',
      detail: storm ? 'Lightning risk possible' : wet ? 'Wet fields possible' : wbF >= 78 ? 'Extra water breaks' : 'Good outdoor setup'
    },
    {
      icon: '🌱',
      label: 'Yard work',
      status: wet ? 'Limited' : windy ? 'Windy' : score >= 68 ? 'Good' : 'Caution',
      detail: wet ? 'Best after dry window' : windy ? 'Avoid light debris work' : 'Good for outdoor tasks'
    },
    {
      icon: '🏖',
      label: 'Beach',
      status: wet || windy ? 'Mixed' : score >= 70 ? 'Good' : 'Caution',
      detail: current.uvIndex >= 7 ? 'High UV protection needed' : windy ? 'Breezy by the water' : 'Comfort depends on cloud cover'
    },
    {
      icon: '🎣',
      label: 'Fishing',
      status: storm ? 'Avoid storms' : windy ? 'Wind factor' : wet ? 'Rain gear' : 'Good',
      detail: storm ? 'Lightning risk possible' : windy ? 'Choppy/exposed areas' : 'Check local marine details'
    }
  ];
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
      'uv_index',
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
      'uv_index_max',
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
    uvIndex: data.hourly.uv_index?.[i] ?? 0,
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
    uvIndexMax: data.daily.uv_index_max?.[i] ?? 0,
    precipSumMm: data.daily.precipitation_sum?.[i] ?? 0,
    rainSumMm: data.daily.rain_sum?.[i] ?? 0,
    showersSumMm: data.daily.showers_sum?.[i] ?? 0,
    snowSumCm: data.daily.snowfall_sum?.[i] ?? 0,
    precipProbMax: data.daily.precipitation_probability_max?.[i] ?? 0,
    weatherCode: data.daily.weather_code?.[i] ?? 0,
  }));

  return { location, fetchedAt: new Date().toISOString(), timezone: data.timezone, hourly, daily };
}

function OutdoorScoreCard({ current, today }: { current: HourPoint; today: DayPoint }) {
  const score = outdoorScore(current, today);
  return (
    <section className={`score-card ${score.level}`}>
      <div>
        <p>Outdoor Score</p>
        <strong>{score.score}</strong>
        <span>{score.label}</span>
      </div>
      <Trophy size={36} />
    </section>
  );
}

function RainTimeline({ hours }: { hours: HourPoint[] }) {
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

function HourlyCards({ hours }: { hours: HourPoint[] }) {
  const next = upcomingHours(hours, 12);
  return (
    <div className="hourly-cards">
      {next.map(h => {
        const wbF = f(wetBulbC(h.tempC, h.humidity));
        return (
          <article className="hour-card" key={h.time}>
            <div className="hour-card-head">
              <div>
                <strong>{new Date(h.time).toLocaleTimeString([], { hour: 'numeric' })}</strong>
                <span>{weatherIcon(h.weatherCode)} {weatherLabel(h.weatherCode)}</span>
              </div>
              <em>{f(h.tempC)}°</em>
            </div>

            <div className="hour-card-grid">
              <div><span>Temp</span><strong>{f(h.tempC)}°</strong></div>
              <div><span>Feels Like</span><strong>{f(h.apparentC)}°</strong></div>
              <div><span>Dew Point</span><strong>{f(h.dewPointC)}°</strong></div>
              <div><span>Wet Bulb</span><strong>{wbF}°</strong></div>
              <div><span>Humidity</span><strong>{h.humidity}%</strong></div>
              <div><span>Rain Chance</span><strong>{h.precipProb}%</strong></div>
              <div><span>Amount</span><strong>{h.snowCm >= 0.5 ? formatSnowFromCm(h.snowCm) : formatInchesFromMm(h.precipMm)}</strong></div>
              <div><span>Wind</span><strong>{Math.round(h.windMph)} mph</strong></div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ActivityPlanner({ current, today, hours }: { current: HourPoint; today: DayPoint; hours: HourPoint[] }) {
  const items = activityGuidance(current, today, hours);
  return (
    <div className="activity-grid">
      {items.map(item => (
        <div className="activity" key={item.label}>
          <span className="activity-icon">{item.icon}</span>
          <div>
            <strong>{item.label}</strong>
            <em>{item.status}</em>
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function WeatherCard({ data }: { data: WeatherData }) {
  const now = currentHour(data.hourly);
  const today = data.daily[0];
  const wbF = f(wetBulbC(now.tempC, now.humidity));
  const comfort = comfortCategory(wbF, f(now.dewPointC), f(now.tempC));
  const rainRisk = precipRisk(today.precipProbMax, today.precipSumMm, today.snowSumCm);
  const hasStorm = stormRisk(data.hourly);

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
          {hasStorm && <span className="badge danger">Storm risk</span>}
        </div>
      </div>

      <OutdoorScoreCard current={now} today={today} />

      <div className="hero-grid">
        <div className="hero-number">
          <span>{f(now.tempC)}°</span>
          <small>{weatherIcon(now.weatherCode)} {weatherLabel(now.weatherCode)} · feels {f(now.apparentC)}°</small>
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
          <Sun size={18} />
          <div><strong>{now.uvIndex.toFixed(1)}</strong><small>UV Index</small></div>
        </div>

        <div className="metric">
          {today.snowSumCm > 1 ? <Snowflake size={18} /> : <CloudRain size={18} />}
          <div><strong>{today.snowSumCm > 1 ? formatSnowFromCm(today.snowSumCm) : formatInchesFromMm(today.precipSumMm)}</strong><small>Today total</small></div>
        </div>
      </div>

      <div className="summary-row">
        <div><span>Next precip</span><strong>{describeNextPrecip(data.hourly)}</strong></div>
        <div><span>Best dry window</span><strong>{bestDryWindow(data.hourly)}</strong></div>
        <div><span>Heaviest precip</span><strong>{heaviestPrecipWindow(data.hourly)}</strong></div>
        <div><span>Today chance</span><strong>{today.precipProbMax}%</strong></div>
        <div><span>Cloud cover</span><strong>{Math.round(now.cloudCover)}%</strong></div>
        <div><span>Today high/low</span><strong>{f(today.tempMaxC)}° / {f(today.tempMinC)}°</strong></div>
      </div>

      <section className="panel">
        <h3><CloudRain size={16} /> Rain Timeline</h3>
        <RainTimeline hours={data.hourly} />
      </section>

      <section className="panel">
        <h3><Sparkles size={16} /> Activity Recommendations</h3>
        <ActivityPlanner current={now} today={today} hours={data.hourly} />
      </section>

      <section className="panel">
        <h3><Gauge size={16} /> Hourly Planner</h3>
        <HourlyCards hours={data.hourly} />
      </section>

      <section className="panel">
        <h3><ShieldAlert size={16} /> 5-Day Outlook</h3>
        <div className="daily">
          {data.daily.slice(0, 5).map(day => {
            const dayRisk = precipRisk(day.precipProbMax, day.precipSumMm, day.snowSumCm);
            return (
              <div className="day" key={day.date}>
                <strong>{new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</strong>
                <span>{f(day.tempMaxC)}°/{f(day.tempMinC)}°</span>
                <span>{weatherIcon(day.weatherCode)} {weatherLabel(day.weatherCode)}</span>
                <span>{day.precipProbMax}%</span>
                <span>{day.snowSumCm > 1 ? formatSnowFromCm(day.snowSumCm) : formatInchesFromMm(day.precipSumMm)}</span>
                <span>UV {day.uvIndexMax.toFixed(1)}</span>
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
          <h1>Weather planning, not just weather watching.</h1>
          <p>Track comfort, dew point, wet bulb, UV, precipitation timing, best dry windows, outdoor score, and activity guidance for saved locations.</p>
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
        Weather data from Open-Meteo. Wet bulb and Outdoor Score are planning guidance, not safety guarantees. {APP_VERSION}
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
