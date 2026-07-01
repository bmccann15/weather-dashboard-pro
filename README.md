# Weather Dashboard Pro v4

A GitHub-ready React + TypeScript weather dashboard using Open-Meteo.

## Features

- Saved multi-location dashboard
- Traffic-light heat stress banner based on wet bulb temperature
- Current conditions cards
- Best outdoor window finder
- Hourly timeline
- Interactive hourly charts
- Location search using Open-Meteo geocoding
- Local storage for saved locations and settings

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Choose GitHub Actions as the source.
4. Add a workflow that runs `npm ci && npm run build` and publishes the `dist` folder.

For a simpler route, deploy the repo through Netlify and set the build command to `npm run build` and publish directory to `dist`.
