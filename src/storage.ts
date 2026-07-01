import type { Location } from './types';

const defaultLocations: Location[] = [
  { id: 'groton-ma', name: 'Home', admin1: 'Massachusetts', country: 'United States', latitude: 42.6112, longitude: -71.5745, timezone: 'America/New_York' },
  { id: 'boston-ma', name: 'Boston', admin1: 'Massachusetts', country: 'United States', latitude: 42.3601, longitude: -71.0589, timezone: 'America/New_York' },
];

export function loadLocations(): Location[] {
  try {
    const raw = localStorage.getItem('wdp.locations');
    return raw ? JSON.parse(raw) : defaultLocations;
  } catch {
    return defaultLocations;
  }
}

export function saveLocations(locations: Location[]) {
  localStorage.setItem('wdp.locations', JSON.stringify(locations));
}
