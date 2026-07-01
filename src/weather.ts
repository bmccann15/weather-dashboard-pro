import type { HourlyPoint, Location, RiskLevel } from './types';

const forecastBase = 'https://api.open-meteo.com/v1/forecast';
const airBase = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const geoBase = 'https://geocoding-api.open-meteo.com/v1/search';

export async function searchLocations(query: string): Promise<Location[]> {
  const url = `${geoBase}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Location search failed');
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    id: `${r.id}`,
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  }));
}

export async function fetchWeather(location: Location): Promise<HourlyPoint[]> {
  const hourly = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'dew_point_2m',
    'wet_bulb_temperature_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    'uv_index',
    'precipitation_probability',
    'weather_code',
  ].join(',');

  const common = `latitude=${location.latitude}&longitude=${location.longitude}&timezone=auto&forecast_days=2`;
  const forecastUrl = `${forecastBase}?${common}&hourly=${hourly}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`;
  const airUrl = `${airBase}?${common}&hourly=us_aqi&forecast_days=2`;

  const [forecastRes, airRes] = await Promise.all([fetch(forecastUrl), fetch(airUrl).catch(() => null)]);
  if (!forecastRes.ok) throw new Error('Weather fetch failed');
  const forecast = await forecastRes.json();
  const air = airRes && airRes.ok ? await airRes.json() : undefined;

  const h = forecast.hourly;
  const aqiByTime = new Map<string, number>();
  if (air?.hourly?.time && air?.hourly?.us_aqi) {
    air.hourly.time.forEach((t: string, i: number) => aqiByTime.set(t, air.hourly.us_aqi[i]));
  }

  return h.time.map((t: string, i: number) => ({
    time: t,
    temp: Math.round(h.temperature_2m[i]),
    feelsLike: Math.round(h.apparent_temperature[i]),
    wetBulb: Math.round(h.wet_bulb_temperature_2m[i]),
    dewpoint: Math.round(h.dew_point_2m[i]),
    humidity: Math.round(h.relative_humidity_2m[i]),
    windSpeed: Math.round(h.wind_speed_10m[i]),
    windDirection: Math.round(h.wind_direction_10m[i]),
    uv: Math.round(h.uv_index[i]),
    precipitationProbability: Math.round(h.precipitation_probability[i] ?? 0),
    weatherCode: h.weather_code[i],
    aqi: aqiByTime.get(t),
  }));
}

export function riskFromWetBulb(wetBulb: number): RiskLevel {
  if (wetBulb >= 82) return 'danger';
  if (wetBulb >= 78) return 'high';
  if (wetBulb >= 74) return 'caution';
  return 'great';
}

export function riskLabel(risk: RiskLevel): string {
  return { great: 'GREAT CONDITIONS', caution: 'USE CAUTION', high: 'HIGH HEAT', danger: 'DANGEROUS' }[risk];
}

export function riskIcon(risk: RiskLevel): string {
  return { great: '🟢', caution: '🟡', high: '🟠', danger: '🔴' }[risk];
}

export function formatWindDirection(deg: number): string {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export function findBestOutdoorWindow(points: HourlyPoint[]): string {
  const today = new Date().toDateString();
  const dayPoints = points.filter(p => new Date(p.time).toDateString() === today);
  const usable = dayPoints.filter(p => riskFromWetBulb(p.wetBulb) === 'great' || riskFromWetBulb(p.wetBulb) === 'caution');
  if (!usable.length) return 'No low-risk window today';

  let bestStart = usable[0];
  let bestRun: HourlyPoint[] = [];
  let run: HourlyPoint[] = [];
  for (const p of dayPoints) {
    const ok = riskFromWetBulb(p.wetBulb) === 'great' || riskFromWetBulb(p.wetBulb) === 'caution';
    if (ok) run.push(p); else run = [];
    if (run.length > bestRun.length) bestRun = [...run];
  }
  if (bestRun.length) bestStart = bestRun[0];
  const bestEnd = bestRun[bestRun.length - 1] ?? bestStart;
  return `${hourLabel(bestStart.time)}–${hourLabel(addOneHour(bestEnd.time))}`;
}

function addOneHour(time: string) {
  const d = new Date(time);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function hourLabel(time: string): string {
  return new Intl.DateTimeFormat([], { hour: 'numeric' }).format(new Date(time));
}

export function fullHourLabel(time: string): string {
  return new Intl.DateTimeFormat([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(time));
}
