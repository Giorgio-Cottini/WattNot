# WattNot app

Expo SDK 54, React Native 0.81, iOS only. One screen of day-ahead electricity prices per bidding zone. The design
source of truth is `docs/overhaul/PLAN.md`; the design system is `DESIGN.md` at the repository root.

```bash
npm ci
npm test                 # pure logic in lib/ and data/, node --test
npx tsc --noEmit
npx expo lint
npx expo start           # open in Expo Go on an iPhone
```

Layout: `app/` holds the routes (the price screen and two form sheets), `components/` the views, `theme.ts` the
palette and type, `lib/` the price logic without React Native, `data/` the fetch, the disk cache and the store.

During development, serve a folder of v1 objects (`v1/prices/<ZONE>/<DATE>.json`) and point
`EXPO_PUBLIC_DATA_BASE_URL` at it.
