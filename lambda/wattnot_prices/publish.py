"""One publishing run: v1 price objects for today and tomorrow, per PLAN.md section 2."""

# stdlib
import datetime as dt
import json
import math
import statistics
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo

# local
from .sources import SOURCES, SourceError, fetch_ecb_rates

UTC = dt.timezone.utc
BERLIN = ZoneInfo("Europe/Berlin")
SLOT_S = 15 * 60
HISTORY_DAYS = 7
MIN_HISTORY_DAYS = 3
# Start of the last scheduled run, Europe/Berlin: keep in step with template.yml.
DEADLINE_BERLIN = dt.time(18, 50)
CACHE_CONTROL = "public, max-age=3600, s-maxage=31536000"


# ------------------------------------------------------------------------------------ #
# Zone: one v1 zone and its sources, primary first, as (source id, source key)
@dataclass(frozen=True)
class Zone:
    code: str
    tz: str
    currency: str
    sources: tuple


ZONES = (
    Zone("GER", "Europe/Berlin", "EUR", (("energinet", "DE"), ("smard", "4169"))),
    Zone("DK1", "Europe/Copenhagen", "DKK", (("energinet", "DK1"), ("smard", "252"))),
    Zone("DK2", "Europe/Copenhagen", "DKK", (("energinet", "DK2"), ("smard", "253"))),
    Zone("NO2", "Europe/Oslo", "NOK", (("energinet", "NO2"), ("smard", "4997"))),
    Zone("SE3", "Europe/Stockholm", "SEK", (("energinet", "SE3"),)),
    Zone("SE4", "Europe/Stockholm", "SEK", (("energinet", "SE4"), ("smard", "258"))),
    Zone("NL", "Europe/Amsterdam", "EUR", (("smard", "256"), ("energy-charts", "NL"))),
    Zone("PL", "Europe/Warsaw", "PLN", (("smard", "257"), ("energy-charts", "PL"))),
)


# ------------------------------------------------------------------------------------ #
# Incomplete: the source has not published every quarter hour of the day yet
class Incomplete(Exception):
    pass


# ------------------------------------------------------------------------------------ #
# Invalid: the source published something that breaks the contract
class Invalid(Exception):
    pass


# ------------------------------------------------------------------------------------ #
# DeadlineMissed: the last run of the day ends with an object still missing
class DeadlineMissed(Exception):
    pass


# ------------------------------------------------------------------------------------ #
# day_bounds: UTC start and end of a local calendar day
def day_bounds(tz, day):
    """Return the UTC bounds of a local calendar day.

    Args:
        tz: IANA time zone name of the zone.
        day: datetime.date in that zone.

    Returns:
        (start, end) as aware UTC datetimes, end exclusive. A DST day spans 23 or 25 h.
    """
    # Local midnight in the zone, converted explicitly to UTC. Both bounds convert
    # before any subtraction: aware datetimes that share one ZoneInfo subtract by
    # wall clock, which would give every day 24 h.
    zone = ZoneInfo(tz)
    start = dt.datetime.combine(day, dt.time(0), tzinfo=zone).astimezone(UTC)
    end = dt.datetime.combine(day + dt.timedelta(days=1), dt.time(0), tzinfo=zone)
    return start, end.astimezone(UTC)


# ------------------------------------------------------------------------------------ #
# check_day: the complete, ordered quarter hour prices of one local day
def check_day(series, tz, day):
    """Validate one local day of a source series and return its prices.

    Args:
        series: sources.Series of the zone.
        tz: IANA time zone name of the zone.
        day: datetime.date in that zone.

    Returns:
        List of 92, 96 or 100 EUR/MWh floats, slot i starting at start + 15 min * i.

    Raises:
        Incomplete: a quarter hour has no value yet.
        Invalid: a duplicate instant, an instant off the 15 min grid, or a value
            that is not a finite number.
    """
    start, end = day_bounds(tz, day)
    start_s, end_s = int(start.timestamp()), int(end.timestamp())
    expected = range(start_s, end_s, SLOT_S)
    in_day = {t for t in series.values if start_s <= t < end_s}
    if in_day & series.duplicates:
        raise Invalid(f"duplicate instant {min(in_day & series.duplicates)}")
    if not in_day <= set(expected):
        raise Invalid(f"instant off the 15 min grid {min(in_day - set(expected))}")
    prices = [series.values.get(t) for t in expected]
    missing = sum(price is None for price in prices)
    if missing:
        raise Incomplete(f"{missing} of {len(prices)} slots missing")
    for t, price in zip(expected, prices):
        if isinstance(price, bool) or not isinstance(price, (int, float)):
            raise Invalid(f"value {price!r} at {t} is not a number")
        if not math.isfinite(price):
            raise Invalid(f"value {price!r} at {t} is not finite")
    return [float(price) for price in prices]


# ------------------------------------------------------------------------------------ #
# levels: P25 and P75 over the complete days of the 7 local days before the day
def levels(series, tz, day):
    """Compute the price levels of a day from the same source's history.

    Args:
        series: sources.Series of the zone, covering the 7 days before day.
        tz: IANA time zone name of the zone.
        day: datetime.date in that zone.

    Returns:
        {"p25", "p75", "window_days"} in EUR/MWh, or None below 3 complete days.
    """
    history = []
    for back in range(1, HISTORY_DAYS + 1):
        try:
            history.append(check_day(series, tz, day - dt.timedelta(days=back)))
        except (Incomplete, Invalid):
            continue  # an incomplete history day counts as unavailable
    if len(history) < MIN_HISTORY_DAYS:
        return None
    prices = [price for prices in history for price in prices]
    p25, _, p75 = statistics.quantiles(prices, n=4, method="inclusive")
    return {"p25": p25, "p75": p75, "window_days": HISTORY_DAYS}


# ------------------------------------------------------------------------------------ #
# build_object: the v1 JSON document of one zone and day
def build_object(zone, day, prices, fx, day_levels, source_id, now_utc):
    """Assemble the v1 price object of PLAN.md section 2.

    Args:
        zone: Zone.
        day: datetime.date, the local calendar day of the zone.
        prices: validated EUR/MWh floats, unrounded.
        fx: (rate date, rate) from the ECB, or None for an EUR zone.
        day_levels: output of levels().
        source_id: key of sources.SOURCES that supplied the prices.
        now_utc: aware UTC datetime of the run.

    Returns:
        The object as a dict, keys in contract order.
    """
    start, _ = day_bounds(zone.tz, day)
    source = SOURCES[source_id]
    return {
        "schema": 1,
        "zone": zone.code,
        "date": day.isoformat(),
        "tz": zone.tz,
        "currency": zone.currency,
        "interval_minutes": 15,
        "start_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "prices_eur_mwh": prices,
        "fx": (
            None
            if fx is None
            else {"quote": zone.currency, "rate": fx[1], "date": fx[0], "source": "ECB"}
        ),
        "levels_eur_mwh": day_levels,
        "source": {"id": source_id, "credit": source["credit"], "url": source["url"]},
        "generated_at": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


# ------------------------------------------------------------------------------------ #
# object_key: S3 key of one zone and day
def object_key(zone, day):
    return f"v1/prices/{zone.code}/{day.isoformat()}.json"


# ------------------------------------------------------------------------------------ #
# S3Store: the bucket behind the CloudFront distribution
class S3Store:
    """Writes objects to S3 and invalidates rewritten paths on CloudFront.

    Args:
        s3, cloudfront: boto3 clients, or fakes with the same methods.
        bucket: bucket name.
        distribution_id: CloudFront distribution id.
    """

    def __init__(self, s3, cloudfront, bucket, distribution_id):
        self.s3 = s3
        self.cloudfront = cloudfront
        self.bucket = bucket
        self.distribution_id = distribution_id

    # ------------------------------------------ #
    # exists: HEAD the key; the role has no s3:ListBucket, so a missing key is a 403
    def exists(self, key):
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
        except self.s3.exceptions.ClientError as exc:
            if exc.response["Error"]["Code"] in ("403", "404"):
                return False
            raise
        return True

    # ------------------------------------------ #
    # put: write one object with the contract headers
    def put(self, key, body):
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=body,
            ContentType="application/json",
            CacheControl=CACHE_CONTROL,
        )

    # ------------------------------------------ #
    # invalidate: one CloudFront invalidation for every rewritten key
    def invalidate(self, keys, caller_reference):
        self.cloudfront.create_invalidation(
            DistributionId=self.distribution_id,
            InvalidationBatch={
                "Paths": {"Quantity": len(keys), "Items": [f"/{key}" for key in keys]},
                "CallerReference": caller_reference,
            },
        )


# ------------------------------------------------------------------------------------ #
# DirStore: local mode, the same keys as files under a directory
class DirStore:

    def __init__(self, root):
        self.root = Path(root)

    def exists(self, key):
        return (self.root / key).is_file()

    def put(self, key, body):
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)

    def invalidate(self, keys, caller_reference):
        pass  # a directory has no cache


# ------------------------------------------------------------------------------------ #
# run: publish every missing object of the target days, then log one JSON line
def run(store, get, now_utc, days=None, zones=ZONES, force=False, log=print):
    """Publish the v1 objects of the target days that the store does not hold.

    Args:
        store: S3Store or DirStore.
        get: callable url -> bytes, raising SourceError.
        now_utc: aware UTC datetime of the run.
        days: target dates. Default: today and tomorrow in Europe/Berlin.
        zones: zones to publish.
        force: rewrite objects that exist, and invalidate their paths.
        log: callable that receives the one JSON log line.

    Returns:
        The summary dict that was logged.

    Raises:
        DeadlineMissed: at or after DEADLINE_BERLIN an object is still missing.
    """
    # The run's calendar is Berlin's: convert the UTC instant explicitly, then step
    # by calendar day, not by 24 h, so a DST change cannot skip or repeat a date.
    today = now_utc.astimezone(BERLIN).date()
    days = days or [today, today + dt.timedelta(days=1)]
    summary = {
        "dates": [day.isoformat() for day in days],
        "existing": 0,
        "written": {},
        "pending": {},
        "invalidated": [],
        "errors": [],
    }
    try:
        _publish(store, get, now_utc, days, zones, force, summary)
        late = now_utc.astimezone(BERLIN).time() >= DEADLINE_BERLIN
        if late and summary["pending"]:
            raise DeadlineMissed(
                f"still missing after the last run: {summary['pending']}"
            )
    except Exception as exc:
        summary["errors"].append(f"fatal: {exc!r}")
        raise
    finally:
        log(json.dumps(summary, separators=(",", ":")))
    return summary


# ------------------------------------------------------------------------------------ #
# _publish: the body of run, filling the summary
def _publish(store, get, now_utc, days, zones, force, summary):
    todo, existed = [], set()
    for day in days:
        for zone in zones:
            key = object_key(zone, day)
            if store.exists(key):
                existed.add(key)
                if not force:
                    summary["existing"] += 1
                    continue
            todo.append((zone, day))
    reasons = {(zone, day): [] for zone, day in todo}
    found = {}

    # Primary sources first, then the fallback of every zone still missing.
    for rank in (0, 1):
        groups = {}
        for zone, day in todo:
            if (zone, day) not in found and rank < len(zone.sources):
                groups.setdefault(zone.sources[rank][0], []).append((zone, day))
        for source_id, items in groups.items():
            # One window per source: the 7 history days before the earliest target
            # day to the end of the latest, each bound a local midnight in UTC.
            start = min(
                day_bounds(z.tz, d - dt.timedelta(days=HISTORY_DAYS))[0]
                for z, d in items
            )
            end = max(day_bounds(z.tz, d)[1] for z, d in items)
            keys = sorted({dict(z.sources)[source_id] for z, _ in items})
            try:
                fetched = SOURCES[source_id]["fetch"](get, keys, start, end)
            except SourceError as exc:
                summary["errors"].append(f"{source_id}: {exc}")
                for zone, day in items:
                    reasons[(zone, day)].append(f"{source_id}: fetch failed")
                continue
            for zone, day in items:
                series = fetched[dict(zone.sources)[source_id]]
                try:
                    prices = check_day(series, zone.tz, day)
                except Incomplete as exc:
                    reasons[(zone, day)].append(f"{source_id}: {exc}")
                    continue
                except Invalid as exc:
                    reasons[(zone, day)].append(f"{source_id}: {exc}")
                    summary["errors"].append(f"{source_id} {zone.code} {day}: {exc}")
                    continue
                found[(zone, day)] = (
                    source_id,
                    prices,
                    levels(series, zone.tz, day),
                )

    rates = None
    if any(zone.currency != "EUR" for zone, day in todo if (zone, day) in found):
        try:
            rates = fetch_ecb_rates(get)
        except SourceError as exc:
            summary["errors"].append(f"ecb: {exc}")

    rewritten = []
    for zone, day in todo:
        name = f"{zone.code}/{day.isoformat()}"
        if (zone, day) not in found:
            summary["pending"][name] = "; ".join(reasons[(zone, day)])
            continue
        fx = None
        if zone.currency != "EUR":
            if rates is None or zone.currency not in rates[1]:
                summary["pending"][name] = f"ecb: no {zone.currency} rate"
                continue
            fx = (rates[0], rates[1][zone.currency])
        source_id, prices, day_levels = found[(zone, day)]
        document = build_object(zone, day, prices, fx, day_levels, source_id, now_utc)
        key = object_key(zone, day)
        store.put(
            key, json.dumps(document, separators=(",", ":"), allow_nan=False).encode()
        )
        summary["written"][name] = source_id
        if key in existed:
            rewritten.append(key)

    if rewritten:
        store.invalidate(rewritten, now_utc.strftime("%Y%m%dT%H%M%S.%fZ"))
        summary["invalidated"] = [f"/{key}" for key in rewritten]
