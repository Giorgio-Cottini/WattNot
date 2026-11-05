"""Tests over source responses recorded on 2026-10-26 (tests/fixtures)."""

# stdlib
import datetime as dt
import io
import json
import math
import statistics
import sys
import tempfile
import types
import unittest
import urllib.parse
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock
from zoneinfo import ZoneInfo

# local
from wattnot_prices import publish
from wattnot_prices.publish import (
    ZONES,
    DeadlineMissed,
    DirStore,
    Incomplete,
    Invalid,
    S3Store,
    check_day,
    levels,
    run,
)
from wattnot_prices.sources import Series, SourceError, fetch_smard

FIXTURES = Path(__file__).parent / "fixtures"
UTC = dt.timezone.utc
COPENHAGEN = ZoneInfo("Europe/Copenhagen")
ZONE = {zone.code: zone for zone in ZONES}
D = dt.date


# ------------------------------------------------------------------------------------ #
# energinet_records: the recorded DayAheadPrices records of both windows
def energinet_records():
    records = []
    for name in ("energinet_2026-10.json", "energinet_2026-03.json"):
        records += json.loads((FIXTURES / name).read_bytes())["records"]
    return records


# ------------------------------------------------------------------------------------ #
# utc: parse an Energinet TimeUTC string, which carries no designator
def utc(text):
    return dt.datetime.fromisoformat(text).replace(tzinfo=UTC)


# ------------------------------------------------------------------------------------ #
# FakeHttp: serves the recordings and emulates the Energinet filter and window
class FakeHttp:

    def __init__(self, records=None, fail=()):
        self.records = energinet_records() if records is None else records
        self.fail = fail
        self.urls = []

    # ------------------------------------------ #
    # __call__: the get callable passed to run
    def __call__(self, url):
        self.urls.append(url)
        if any(part in url for part in self.fail):
            raise SourceError(f"HTTP 503 for {url}", status=503)
        parts = urllib.parse.urlsplit(url)
        query = dict(urllib.parse.parse_qsl(parts.query))
        if parts.netloc == "api.energidataservice.dk":
            return self.energinet(query)
        if parts.netloc == "www.smard.de":
            path = FIXTURES / ("smard_" + parts.path.rsplit("/", 1)[1])
            if not path.exists():
                raise SourceError(f"HTTP 404 for {url}", status=404)
            return path.read_bytes()
        if parts.netloc == "api.energy-charts.info":
            return (
                FIXTURES / f"energy-charts_{query['bzn']}_2026-10.json"
            ).read_bytes()
        if parts.netloc == "www.ecb.europa.eu":
            return (FIXTURES / "ecb_eurofxref-daily.xml").read_bytes()
        raise AssertionError(f"unexpected URL {url}")

    # ------------------------------------------ #
    # energinet: the records of the filtered areas whose Danish local time is in range
    def energinet(self, query):
        areas = json.loads(query["filter"])["PriceArea"]
        start = dt.datetime.fromisoformat(query["start"]).replace(tzinfo=COPENHAGEN)
        end = dt.datetime.fromisoformat(query["end"]).replace(tzinfo=COPENHAGEN)
        selected = [
            record
            for record in self.records
            if record["PriceArea"] in areas
            and start <= utc(record["TimeUTC"]) < end  # aware: compared as instants
        ]
        return json.dumps({"records": selected}).encode()


# ------------------------------------------------------------------------------------ #
# ClientError: stands in for botocore's ClientError on a HEAD
class ClientError(Exception):

    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


# ------------------------------------------------------------------------------------ #
# FakeS3: a bucket of keys that answers a HEAD of a missing key with 403
class FakeS3:
    exceptions = types.SimpleNamespace(ClientError=ClientError)

    def __init__(self, keys=()):
        self.objects = {key: b"{}" for key in keys}
        self.puts = []

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise ClientError("403")

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]


# ------------------------------------------------------------------------------------ #
# FakeCloudFront: records invalidations
class FakeCloudFront:

    def __init__(self):
        self.invalidations = []

    def create_invalidation(self, **kwargs):
        self.invalidations.append(kwargs)


# ------------------------------------------------------------------------------------ #
# Harness: one run against fakes, with the stored objects and the log line parsed
class Harness:

    def __init__(self, now, http=None, existing=(), **kwargs):
        self.s3, self.cloudfront = FakeS3(existing), FakeCloudFront()
        self.http = http or FakeHttp()
        self.lines = []
        store = S3Store(self.s3, self.cloudfront, "bucket", "DIST")
        try:
            self.summary = run(store, self.http, now, log=self.lines.append, **kwargs)
        finally:
            self.log = json.loads(self.lines[0]) if self.lines else None

    def object(self, zone, day):
        return json.loads(self.s3.objects[f"v1/prices/{zone}/{day}.json"])


# ------------------------------------------------------------------------------------ #
# source_prices: recorded Energinet values of one area and local day, in UTC order
def source_prices(area, tz, day):
    start, end = publish.day_bounds(tz, day)
    rows = [r for r in energinet_records() if r["PriceArea"] == area]
    rows = [r for r in rows if start <= utc(r["TimeUTC"]) < end]
    return [r["DayAheadPriceEUR"] for r in sorted(rows, key=lambda r: r["TimeUTC"])]


# ------------------------------------------------------------------------------------ #
# expected_levels: P25 and P75 of the recorded 7 days before a day, computed here
def expected_levels(area, tz, day):
    prices = []
    for back in range(1, 8):
        prices += source_prices(area, tz, day - dt.timedelta(days=back))
    q = statistics.quantiles(prices, n=4, method="inclusive")
    return {"p25": q[0], "p75": q[2], "window_days": 7}


# 13:30 CET on 2026-10-26: after publication of 2026-10-27, before the deadline.
AFTERNOON = dt.datetime(2026, 10, 26, 12, 30, tzinfo=UTC)
# 18:50 CET on 2026-10-26: the last scheduled run.
DEADLINE = dt.datetime(2026, 10, 26, 17, 50, tzinfo=UTC)


# ------------------------------------------------------------------------------------ #
# TestNormalDay: today and tomorrow of an Energinet zone and an EUR zone
class TestNormalDay(unittest.TestCase):

    def setUp(self):
        self.h = Harness(AFTERNOON, zones=[ZONE["GER"], ZONE["SE3"]])

    def test_writes_today_and_tomorrow_in_berlin(self):
        self.assertEqual(self.h.log["dates"], ["2026-10-26", "2026-10-27"])
        self.assertEqual(
            sorted(self.h.s3.objects),
            [
                "v1/prices/GER/2026-10-26.json",
                "v1/prices/GER/2026-10-27.json",
                "v1/prices/SE3/2026-10-26.json",
                "v1/prices/SE3/2026-10-27.json",
            ],
        )
        self.assertEqual(self.h.log["pending"], {})
        self.assertEqual(self.h.log["errors"], [])

    def test_object_shape(self):
        obj = self.h.object("SE3", "2026-10-27")
        self.assertEqual(
            list(obj),
            [
                "schema",
                "zone",
                "date",
                "tz",
                "currency",
                "interval_minutes",
                "start_utc",
                "prices_eur_mwh",
                "fx",
                "levels_eur_mwh",
                "source",
                "generated_at",
            ],
        )
        self.assertEqual(obj["schema"], 1)
        self.assertEqual(obj["tz"], "Europe/Stockholm")
        self.assertEqual(obj["currency"], "SEK")
        self.assertEqual(obj["interval_minutes"], 15)
        self.assertEqual(obj["start_utc"], "2026-10-26T23:00:00Z")
        self.assertEqual(obj["generated_at"], "2026-10-26T12:30:00Z")
        self.assertEqual(
            obj["source"],
            {
                "id": "energinet",
                "credit": "Source: Energinet (www.energidataservice.dk), CC BY 4.0.",
                "url": "https://www.energidataservice.dk/",
            },
        )

    def test_prices_in_slot_order(self):
        obj = self.h.object("SE3", "2026-10-27")
        self.assertEqual(len(obj["prices_eur_mwh"]), 96)
        self.assertEqual(
            obj["prices_eur_mwh"],
            source_prices("SE3", "Europe/Stockholm", D(2026, 10, 27)),
        )

    def test_fx_is_the_ecb_rate(self):
        obj = self.h.object("SE3", "2026-10-27")
        self.assertEqual(
            obj["fx"],
            {"quote": "SEK", "rate": 11.1385, "date": "2026-10-26", "source": "ECB"},
        )

    def test_levels_from_previous_7_days(self):
        obj = self.h.object("SE3", "2026-10-27")
        expected = expected_levels("SE3", "Europe/Stockholm", D(2026, 10, 27))
        self.assertEqual(obj["levels_eur_mwh"], expected)

    def test_headers(self):
        for put in self.h.s3.puts:
            self.assertEqual(put["ContentType"], "application/json")
            self.assertEqual(
                put["CacheControl"], "public, max-age=3600, s-maxage=31536000"
            )

    def test_one_energinet_request_in_danish_local_time(self):
        urls = [u for u in self.h.http.urls if "energidataservice" in u]
        self.assertEqual(len(urls), 1)
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(urls[0]).query))
        self.assertEqual(query["start"], "2026-10-19T00:00")
        self.assertEqual(query["end"], "2026-10-28T00:00")
        self.assertEqual(json.loads(query["filter"]), {"PriceArea": ["DE", "SE3"]})

    def test_one_log_line(self):
        self.assertEqual(len(self.h.lines), 1)
        self.assertEqual(self.h.log["written"]["SE3/2026-10-27"], "energinet")
        self.assertEqual(self.h.log["invalidated"], [])


# ------------------------------------------------------------------------------------ #
# TestDstDays: 100 slots on 2026-10-25 and 92 on 2026-03-29, keyed on UTC
class TestDstDays(unittest.TestCase):

    def test_october_100_slots(self):
        now = dt.datetime(2026, 10, 25, 12, 30, tzinfo=UTC)
        h = Harness(now, days=[D(2026, 10, 25)], zones=[ZONE["DK1"]])
        obj = h.object("DK1", "2026-10-25")
        self.assertEqual(obj["start_utc"], "2026-10-24T22:00:00Z")
        self.assertEqual(len(obj["prices_eur_mwh"]), 100)
        # Slot i starts at start_utc + 15 min * i: both copies of the repeated hour.
        start = dt.datetime(2026, 10, 24, 22, tzinfo=UTC)
        by_instant = {
            utc(r["TimeUTC"]): r["DayAheadPriceEUR"]
            for r in energinet_records()
            if r["PriceArea"] == "DK1"
        }
        for i, price in enumerate(obj["prices_eur_mwh"]):
            self.assertEqual(price, by_instant[start + dt.timedelta(minutes=15 * i)])
        self.assertEqual(
            obj["levels_eur_mwh"],
            expected_levels("DK1", "Europe/Copenhagen", D(2026, 10, 25)),
        )

    def test_march_92_slots(self):
        now = dt.datetime(2026, 3, 28, 12, 30, tzinfo=UTC)
        h = Harness(now, days=[D(2026, 3, 29)], zones=[ZONE["SE4"]])
        obj = h.object("SE4", "2026-03-29")
        self.assertEqual(obj["start_utc"], "2026-03-28T23:00:00Z")
        self.assertEqual(len(obj["prices_eur_mwh"]), 92)
        self.assertEqual(
            obj["prices_eur_mwh"],
            source_prices("SE4", "Europe/Stockholm", D(2026, 3, 29)),
        )
        self.assertIsNotNone(obj["levels_eur_mwh"])


# ------------------------------------------------------------------------------------ #
# TestFallback: a failing primary hands the zone to its fallback, SE3 has none
class TestFallback(unittest.TestCase):

    def test_energinet_failure_uses_smard(self):
        http = FakeHttp(fail=("energidataservice",))
        h = Harness(AFTERNOON, http=http, days=[D(2026, 10, 27)], zones=[ZONE["DK1"]])
        obj = h.object("DK1", "2026-10-27")
        self.assertEqual(obj["source"]["id"], "smard")
        self.assertEqual(
            obj["source"]["credit"], "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0."
        )
        week = json.loads(
            (FIXTURES / "smard_252_DE_quarterhour_1792969200000.json").read_bytes()
        )
        start_ms = 1793055600000  # 2026-10-26T23:00Z
        smard = dict(week["series"])
        self.assertEqual(
            obj["prices_eur_mwh"], [smard[start_ms + i * 900_000] for i in range(96)]
        )
        self.assertIsNotNone(obj["levels_eur_mwh"])
        self.assertTrue(h.log["errors"][0].startswith("energinet: HTTP 503"))

    def test_smard_failure_uses_energy_charts(self):
        http = FakeHttp(fail=("smard.de",))
        h = Harness(AFTERNOON, http=http, days=[D(2026, 10, 27)], zones=[ZONE["NL"]])
        obj = h.object("NL", "2026-10-27")
        self.assertEqual(obj["source"]["id"], "energy-charts")
        self.assertEqual(
            obj["source"]["credit"], "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0."
        )
        self.assertIsNone(obj["fx"])
        url = [u for u in http.urls if "energy-charts" in u][0]
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))
        self.assertEqual(query["start"], "2026-10-19T22:00Z")
        self.assertEqual(query["end"], "2026-10-27T22:45Z")

    def test_se3_without_fallback_stays_pending(self):
        http = FakeHttp(fail=("energidataservice",))
        h = Harness(AFTERNOON, http=http, days=[D(2026, 10, 27)], zones=[ZONE["SE3"]])
        self.assertEqual(h.s3.puts, [])
        self.assertEqual(
            h.log["pending"], {"SE3/2026-10-27": "energinet: fetch failed"}
        )

    def test_deadline_raises_when_missing(self):
        http = FakeHttp(fail=("energidataservice",))
        with self.assertRaises(DeadlineMissed):
            Harness(DEADLINE, http=http, zones=[ZONE["SE3"]])

    def test_deadline_quiet_when_complete(self):
        h = Harness(DEADLINE, zones=[ZONE["SE3"]])
        self.assertEqual(h.log["pending"], {})


# ------------------------------------------------------------------------------------ #
# TestValidation: incomplete, duplicate, off grid and non finite data never publish
class TestValidation(unittest.TestCase):

    def without(self, area, time_utc):
        return [
            r
            for r in energinet_records()
            if not (r["PriceArea"] == area and r["TimeUTC"] == time_utc)
        ]

    def test_incomplete_day_rejected(self):
        http = FakeHttp(records=self.without("SE3", "2026-10-27T10:00:00"))
        h = Harness(AFTERNOON, http=http, zones=[ZONE["SE3"]])
        self.assertIn("v1/prices/SE3/2026-10-26.json", h.s3.objects)
        self.assertNotIn("v1/prices/SE3/2026-10-27.json", h.s3.objects)
        self.assertEqual(
            h.log["pending"], {"SE3/2026-10-27": "energinet: 1 of 96 slots missing"}
        )

    def test_unpublished_smard_day_pending_after_both_sources(self):
        now = dt.datetime(2026, 10, 27, 10, 0, tzinfo=UTC)
        h = Harness(now, zones=[ZONE["NL"]])
        self.assertEqual(h.log["written"], {"NL/2026-10-27": "smard"})
        self.assertEqual(
            h.log["pending"],
            {
                "NL/2026-10-28": "smard: 96 of 96 slots missing; "
                "energy-charts: 96 of 96 slots missing"
            },
        )

    def series(self, pairs):
        series = Series()
        for epoch_s, value in pairs:
            series.add(epoch_s, value)
        return series

    def day_pairs(self, day=D(2026, 10, 27)):
        start, end = publish.day_bounds("Europe/Stockholm", day)
        return [
            (t, 50.0) for t in range(int(start.timestamp()), int(end.timestamp()), 900)
        ]

    def test_duplicate_instant_invalid(self):
        pairs = self.day_pairs()
        with self.assertRaises(Invalid):
            check_day(
                self.series(pairs + [pairs[3]]), "Europe/Stockholm", D(2026, 10, 27)
            )

    def test_off_grid_instant_invalid(self):
        pairs = self.day_pairs() + [(self.day_pairs()[0][0] + 60, 1.0)]
        with self.assertRaises(Invalid):
            check_day(self.series(pairs), "Europe/Stockholm", D(2026, 10, 27))

    def test_non_finite_invalid(self):
        for bad in (math.nan, math.inf, "12.5", True):
            pairs = self.day_pairs()
            pairs[5] = (pairs[5][0], bad)
            with self.assertRaises(Invalid, msg=repr(bad)):
                check_day(self.series(pairs), "Europe/Stockholm", D(2026, 10, 27))

    def test_null_is_incomplete(self):
        pairs = self.day_pairs()
        pairs[0] = (pairs[0][0], None)
        with self.assertRaises(Incomplete):
            check_day(self.series(pairs), "Europe/Stockholm", D(2026, 10, 27))

    def test_invalid_primary_logged_as_error(self):
        records = energinet_records()
        dup = next(
            r
            for r in records
            if r["PriceArea"] == "SE3" and r["TimeUTC"] == "2026-10-27T10:00:00"
        )
        h = Harness(
            AFTERNOON, http=FakeHttp(records=records + [dup]), zones=[ZONE["SE3"]]
        )
        self.assertNotIn("v1/prices/SE3/2026-10-27.json", h.s3.objects)
        self.assertIn("duplicate instant", h.log["errors"][0])


# ------------------------------------------------------------------------------------ #
# TestLevels: null below 3 complete history days
class TestLevels(unittest.TestCase):

    def se3_series(self, keep_days):
        series = Series()
        for record in energinet_records():
            day = utc(record["TimeUTC"]).astimezone(ZoneInfo("Europe/Stockholm")).date()
            if record["PriceArea"] == "SE3" and day in keep_days:
                series.add(
                    int(utc(record["TimeUTC"]).timestamp()), record["DayAheadPriceEUR"]
                )
        return series

    def test_null_with_2_days(self):
        series = self.se3_series({D(2026, 10, 25), D(2026, 10, 26)})
        self.assertIsNone(levels(series, "Europe/Stockholm", D(2026, 10, 27)))

    def test_present_with_3_days(self):
        days = {D(2026, 10, 24), D(2026, 10, 25), D(2026, 10, 26)}
        result = levels(self.se3_series(days), "Europe/Stockholm", D(2026, 10, 27))
        prices = []
        for day in sorted(days):
            prices += source_prices("SE3", "Europe/Stockholm", day)
        q = statistics.quantiles(prices, n=4, method="inclusive")
        self.assertEqual(result, {"p25": q[0], "p75": q[2], "window_days": 7})

    def test_null_in_object(self):
        # Local 2026-10-26 starts at 2026-10-25T23:00Z: one complete history day.
        keep = ("2026-10-25T23", "2026-10-26", "2026-10-27")
        records = [
            r
            for r in energinet_records()
            if r["PriceArea"] != "SE3" or r["TimeUTC"].startswith(keep)
        ]
        h = Harness(AFTERNOON, http=FakeHttp(records=records), zones=[ZONE["SE3"]])
        self.assertIsNone(h.object("SE3", "2026-10-27")["levels_eur_mwh"])


# ------------------------------------------------------------------------------------ #
# TestCurrency: EUR zones carry fx null, converted inputs stay unrounded
class TestCurrency(unittest.TestCase):

    def test_eur_zones_fx_null_and_no_ecb_request(self):
        h = Harness(AFTERNOON, zones=[ZONE["GER"], ZONE["NL"]])
        for zone in ("GER", "NL"):
            obj = h.object(zone, "2026-10-27")
            self.assertEqual(obj["currency"], "EUR")
            self.assertIsNone(obj["fx"])
        self.assertFalse(any("ecb.europa.eu" in u for u in h.http.urls))

    def test_pln_from_smard_is_converted_with_the_ecb_rate(self):
        h = Harness(AFTERNOON, days=[D(2026, 10, 27)], zones=[ZONE["PL"]])
        obj = h.object("PL", "2026-10-27")
        self.assertEqual(obj["fx"]["rate"], 4.4038)
        self.assertEqual(obj["source"]["id"], "smard")

    def test_inputs_unrounded(self):
        records = energinet_records()
        for record in records:
            if (
                record["PriceArea"] == "SE3"
                and record["TimeUTC"] == "2026-10-27T10:00:00"
            ):
                record["DayAheadPriceEUR"] = 12.3456789
        h = Harness(AFTERNOON, http=FakeHttp(records=records), zones=[ZONE["SE3"]])
        body = h.s3.objects["v1/prices/SE3/2026-10-27.json"]
        self.assertIn(b"12.3456789", body)
        self.assertIn(b'"rate":11.1385', body)
        # A published value with 6 decimals, as Energinet stores it, survives as is.
        published = source_prices("SE3", "Europe/Stockholm", D(2026, 10, 26))
        self.assertEqual(h.object("SE3", "2026-10-26")["prices_eur_mwh"], published)


# ------------------------------------------------------------------------------------ #
# TestStore: HEAD skips existing objects, a forced rewrite invalidates only its path
class TestStore(unittest.TestCase):

    def test_existing_objects_skip_every_fetch(self):
        keys = [
            f"v1/prices/{z}/{d}.json"
            for z in ZONE
            for d in ("2026-10-26", "2026-10-27")
        ]
        h = Harness(AFTERNOON, existing=keys)
        self.assertEqual(h.http.urls, [])
        self.assertEqual(h.s3.puts, [])
        self.assertEqual(h.log["existing"], 16)

    def test_force_invalidates_only_rewritten_paths(self):
        h = Harness(
            AFTERNOON,
            existing=["v1/prices/SE3/2026-10-27.json"],
            days=[D(2026, 10, 27)],
            zones=[ZONE["GER"], ZONE["SE3"]],
            force=True,
        )
        self.assertEqual(len(h.s3.puts), 2)
        self.assertEqual(len(h.cloudfront.invalidations), 1)
        batch = h.cloudfront.invalidations[0]["InvalidationBatch"]
        self.assertEqual(
            batch["Paths"], {"Quantity": 1, "Items": ["/v1/prices/SE3/2026-10-27.json"]}
        )
        self.assertEqual(h.log["invalidated"], ["/v1/prices/SE3/2026-10-27.json"])

    def test_dir_store_layout(self):
        with tempfile.TemporaryDirectory() as tmp:
            run(
                DirStore(tmp),
                FakeHttp(),
                AFTERNOON,
                zones=[ZONE["DK1"]],
                log=lambda _: None,
            )
            files = sorted(
                p.relative_to(tmp).as_posix() for p in Path(tmp).rglob("*.json")
            )
        self.assertEqual(
            files, ["v1/prices/DK1/2026-10-26.json", "v1/prices/DK1/2026-10-27.json"]
        )


# ------------------------------------------------------------------------------------ #
# TestSmardWeeks: only the newest weekly file may be absent
class TestSmardWeeks(unittest.TestCase):

    def window(self, first, last):
        return (
            publish.day_bounds("Europe/Berlin", first)[0],
            publish.day_bounds("Europe/Berlin", last)[1],
        )

    def test_missing_newest_week_is_empty(self):
        # 2026-11-02 is a Monday whose file does not exist yet.
        series = fetch_smard(
            FakeHttp(), ["256"], *self.window(D(2026, 10, 27), D(2026, 11, 2))
        )
        with self.assertRaises(Incomplete):
            check_day(series["256"], "Europe/Amsterdam", D(2026, 11, 2))
        self.assertEqual(
            len(check_day(series["256"], "Europe/Amsterdam", D(2026, 10, 27))), 96
        )

    def test_missing_older_week_fails(self):
        with self.assertRaises(SourceError):
            fetch_smard(
                FakeHttp(), ["256"], *self.window(D(2026, 10, 10), D(2026, 10, 27))
            )


# ------------------------------------------------------------------------------------ #
# TestHandler: the Lambda event with a stubbed boto3
class TestHandler(unittest.TestCase):

    def setUp(self):
        self.s3, self.cloudfront = FakeS3(), FakeCloudFront()
        clients = {"s3": self.s3, "cloudfront": self.cloudfront}
        boto3 = types.SimpleNamespace(client=clients.__getitem__)
        env = {"BUCKET": "bucket", "DISTRIBUTION_ID": "DIST"}
        with mock.patch.dict(sys.modules, {"boto3": boto3}), mock.patch.dict(
            "os.environ", env
        ):
            sys.modules.pop("wattnot_prices.handler", None)
            from wattnot_prices import handler
        self.handler = handler

    def test_manual_date_and_zones(self):
        with mock.patch.object(self.handler, "http_get", FakeHttp()), redirect_stdout(
            io.StringIO()
        ):
            summary = self.handler.handler(
                {"date": "2026-10-27", "zones": ["SE3"]}, None
            )
        self.assertEqual(summary["written"], {"SE3/2026-10-27": "energinet"})

    def test_rejects_unknown_input(self):
        for event in ({"zones": ["FI"]}, {"force": "yes"}, {"dates": []}):
            with self.assertRaises(ValueError, msg=event):
                self.handler.handler(event, None)


if __name__ == "__main__":
    unittest.main()
