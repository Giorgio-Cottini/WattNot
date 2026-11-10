# WattNot

A free iPhone app that helps households on a dynamic tariff cut their electricity bill by shifting
flexible loads, such as a dishwasher or an EV charger, to the cheapest hours of the day-ahead
market. It shows the spot price of one bidding zone for today and tomorrow, and the cheapest time
to start a load of 1 to 4 hours. The app has no account, no ads and no purchases, and it collects
no user data.

This repository holds the app, the backend that publishes the prices, and the support and privacy
pages. The app is not on the App Store yet.

## Data sources

WattNot shows prices only from sources whose licence permits reuse. Eight bidding zones are
covered:

| Zone | Primary source              | Fallback      | Currency |
| ---- | --------------------------- | ------------- | -------- |
| GER  | Energinet                   | SMARD         | EUR      |
| DK1  | Energinet                   | SMARD         | DKK      |
| DK2  | Energinet                   | SMARD         | DKK      |
| NO2  | Energinet                   | SMARD         | NOK      |
| SE3  | Energinet                   | none          | SEK      |
| SE4  | Energinet                   | SMARD         | SEK      |
| NL   | SMARD                       | Energy-Charts | EUR      |
| PL   | SMARD                       | Energy-Charts | PLN      |

Energinet ([Energi Data Service](https://www.energidataservice.dk/)) and the Bundesnetzagentur
([SMARD](https://www.smard.de/)) publish under CC BY 4.0. The publisher falls back to
Energy-Charts only for zones whose data originates at SMARD. Prices in DKK, NOK, SEK and PLN are
converted from EUR at the latest
[European Central Bank](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
reference rate, and the app names the date of that rate.

The other nine Nord Pool zones (EE, FI, LV, NO1, NO3, NO4, NO5, SE1, SE2) appear in the zone
picker as "Not available yet" and link to the public price page of Nord Pool. The app shows no
Nord Pool data.

## Requirements

- Node.js with npm, and an iPhone with Expo Go, to run the app.
- Python 3.12 for the backend. The publisher uses the standard library, and boto3 only in the
  Lambda handler that talks to S3 and CloudFront.
- An AWS account, only to deploy the backend. The tests and the local mode need no credentials.

## Setup

```bash
cd energy && npm ci                 # app dependencies
pip install boto3                   # backend, only to run the Lambda handler outside AWS
```

By default the app reads the published objects from the production CloudFront host. To serve a
local folder instead, set `EXPO_PUBLIC_DATA_BASE_URL` to a server whose root holds
`v1/prices/<ZONE>/<DATE>.json`, for example the output of the backend's local mode.

## Running

| Command (from)                                              | Does                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npx expo start` (`energy/`)                                | Starts the app in Expo Go                                                  |
| `npm test` (`energy/`)                                      | Runs the tests of the price logic in `lib/` and `data/` with `node --test` |
| `npx tsc --noEmit` and `npx expo lint` (`energy/`)          | Type check and lint                                                        |
| `python -m unittest` (`lambda/`)                            | Runs the backend tests against source responses recorded on 2026-10-26     |
| `python -m wattnot_prices --out fixtures [--date YYYY-MM-DD]` (`lambda/`) | Fetches live prices and writes the objects to files instead of S3 |

## Repository layout

```
energy/                  ← the iPhone app (Expo SDK 58, React Native, TypeScript)
├── app/                 ← routes: the price screen, the zone picker and About sheets
├── components/          ← views, including the step chart and the Best time card
├── data/                ← fetch, disk cache and store
├── lib/                 ← price logic without React Native, with its tests
│   └── fixtures/        ← recorded day objects used by the tests
└── theme.ts             ← palette and type
lambda/                  ← the price publisher (one Python 3.12 Lambda)
├── wattnot_prices/      ← sources, validation, levels, object, stores, run
├── tests/               ← unittest suite and recorded source responses
├── fixtures/v1/prices/  ← live objects for 2026-10-26 and 2026-10-27
└── template.yml         ← CloudFormation: function, role, schedule, alarm, budget
release/
├── icon/                ← icon and splash sources, and the script that renders them
└── site/                ← support and privacy pages
archive/usage-view/      ← an earlier Usage view, kept out of the build
DESIGN.md                ← the design system
PRODUCT.md               ← users, purpose and product principles
```

## Price pipeline: logical steps

The backend writes one JSON object per zone and local day, and the app reads only those objects.
Every price is identified by its UTC instant. Labels are computed in the zone's time zone, never
the device's.

### 1. Fetch: `lambda/wattnot_prices/sources.py`

An EventBridge schedule runs the Lambda every 10 minutes from 13:00 to 18:50 Europe/Berlin. For
each zone it targets today and tomorrow and skips an object that already exists. For a missing
day it requests the primary source, then the fallback.

### 2. Validate the day: `lambda/wattnot_prices/publish.py`

A day is written only when it is complete: one price per quarter hour of the local day, which is
96 quarters, or 92 and 100 on the days of the daylight saving changes. The next run tries an
incomplete day again. If an object is still missing at 18:50, the run raises and a CloudWatch
alarm emails the owner.

### 3. Currency and levels

For DKK, NOK, SEK and PLN zones the object records the ECB reference rate and its date. Prices
stay in EUR/MWh in the object, and the app converts them:

```
price [subunit/kWh] = price [EUR/MWh] · rate / 10
```

The object also carries the 25th and 75th percentiles (P25, P75) of the previous 7 local days. The
app sorts each quarter into four levels, and shows none when fewer than 3 days of history exist:

```
cheap           price < P25
normal          P25 ≤ price ≤ P75
expensive       P75 < price ≤ P75 + 1.5 · (P75 − P25)
very expensive  price > P75 + 1.5 · (P75 − P25)     (upper Tukey fence)
```

A price at or below zero carries the separate "zero or negative" marker.

### 4. Publish

The object is written to S3 at `v1/prices/<ZONE>/<YYYY-MM-DD>.json` and served through CloudFront.
It holds the zone, the time zone, the currency, `start_utc` (local midnight), the quarter-hour
prices, the exchange rate, the levels and the source credit. Each run logs one JSON line with the
dates, the zones written, the zones pending, the sources used and the errors.

### 5. Slots and labels: `energy/lib/slots.ts`, `energy/lib/time.ts`

Slot `i` covers `[start_utc + 15 min · i, start_utc + 15 min · (i + 1))`. On the autumn change the
repeated hour carries its zone abbreviation, as in "02:00 CEST" and "02:00 CET". The chart steps
by the hour and shows the quarters on touch.

### 6. Best time: `energy/lib/best.ts`

For a load of 1 to 4 hours, the app finds the contiguous window with the lowest average price,
from the current quarter to the end of the published data. When two windows are equal, the
earlier one wins. The card shows the window's start, its average price, and the difference from
starting now.

### 7. Refresh: `energy/data/`

The app reads the disk cache first and fetches on launch and on a return to the foreground.
Nothing runs in the background, and the app sends no notifications.

## License

The source code is licensed under the Apache License 2.0: see `LICENSE`. The JSON price files
under `energy/lib/fixtures/`, `lambda/fixtures/` and `lambda/tests/fixtures/` are third-party data
under CC BY 4.0, with the credits in `NOTICE`. The licence grants no right to use the name
"WattNot" or its icon.

## Citation

See `CITATION.cff`.

## Author

Giorgio Cottini. cottinigiorgio@gmail.com
