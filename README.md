# Weather Dashboard Pro v5.1

A phone-friendly weather planning dashboard for saved locations.

## v5.1 Highlights

- Labeled hourly forecast cards
- Outdoor Score
- Rain timeline
- Best dry window
- Current conditions
- Dew point and wet bulb
- Wind, humidity, cloud cover
- UV Index
- Activity guidance for walking, kids' sports, yard work, beach, biking, fishing, and hockey travel
- GitHub Pages workflow configured for `weather-dashboard-pro`

## Important dependency note

This package intentionally does **not** include `package-lock.json`.

Reason: a previous lock file was generated through an internal package mirror and caused GitHub Actions to try downloading from the wrong registry. The included workflow uses:

```bash
npm install --registry=https://registry.npmjs.org/
```

and does not enable npm cache, so it will not require a lock file.

After GitHub successfully installs once, you may generate a clean lock file locally if you want, but it is not required for deployment.
