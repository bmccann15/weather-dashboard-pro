export type Location = {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

export type HourlyPoint = {
  time: string;
  temp: number;
  feelsLike: number;
  wetBulb: number;
  dewpoint: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  uv: number;
  precipitationProbability: number;
  weatherCode: number;
  aqi?: number;
};

export type RiskLevel = 'great' | 'caution' | 'high' | 'danger';

export type ChartMetric = 'temp' | 'feelsLike' | 'wetBulb' | 'dewpoint' | 'humidity' | 'windSpeed' | 'uv';
