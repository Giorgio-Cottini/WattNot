# lambda: WattNot v1 price publisher

`wattnot_prices` is one Python 3.12 arm64 zip Lambda (standard library plus boto3). Every 10 minutes from 13:00
to 18:50 Europe/Berlin it publishes `v1/prices/<ZONE>/<DATE>.json` for today and tomorrow in the 8 v1 zones, in the
shape of `docs/overhaul/PLAN.md` section 2. It skips objects that exist (HEAD), takes the zone's primary source and
then its fallback (Energinet, SMARD, Energy-Charts), writes only complete days, adds the ECB reference rate for
DKK, NOK, SEK and PLN zones and the P25 and P75 levels of the previous 7 days, and logs one JSON line per run. The
18:50 run raises when an object is still missing, and the Errors alarm emails the owner.

| Path                         | Content                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `wattnot_prices/sources.py`  | Source fetchers and the ECB rate                                   |
| `wattnot_prices/publish.py`  | Zones, validation, levels, object, S3 and local stores, the run    |
| `wattnot_prices/handler.py`  | Lambda entry point `wattnot_prices.handler.handler`                |
| `wattnot_prices/__main__.py` | Local mode                                                         |
| `template.yml`               | CloudFormation: function, role, schedule, log group, alarm, budget |
| `tests/`                     | `python -m unittest` over source responses recorded on 2026-10-26  |
| `fixtures/v1/prices/`        | Live objects for 2026-10-26 and 2026-10-27, made by the local mode |

Run from this directory:

```bash
python -m unittest
python -m wattnot_prices --out fixtures [--date YYYY-MM-DD]   # live GETs, writes files instead of S3
```

Deploy and teardown of the old stack: `docs/overhaul/DEPLOY.md`.
