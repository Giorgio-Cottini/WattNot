"""Price and exchange rate sources: Energinet, SMARD, Energy-Charts and the ECB.

Every fetcher returns a Series per source key: UTC epoch seconds of each quarter hour
start mapped to the published EUR/MWh value, or None where the source has no value yet.
"""

# stdlib
import datetime as dt
import http.client
import json
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
BERLIN = ZoneInfo("Europe/Berlin")
COPENHAGEN = ZoneInfo("Europe/Copenhagen")
USER_AGENT = "WattNot/1.0"
TIMEOUT_S = 15

ENERGINET_URL = "https://api.energidataservice.dk/dataset/DayAheadPrices"
SMARD_URL = "https://www.smard.de/app/chart_data/{id}/DE/{id}_DE_quarterhour_{ms}.json"
ENERGY_CHARTS_URL = "https://api.energy-charts.info/price"
ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
ECB_NS = "{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}"

ENERGINET_CREDIT = "Source: Energinet (www.energidataservice.dk), CC BY 4.0."
SMARD_CREDIT = "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0."


# ------------------------------------------------------------------------------------ #
# SourceError: a fetch or parse failure of one source, with the HTTP status if any
class SourceError(Exception):

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


# ------------------------------------------------------------------------------------ #
# Series: one source key's quarter hour values, plus the instants it published twice
class Series:

    def __init__(self):
        self.values = {}
        self.duplicates = set()

    # ------------------------------------------ #
    # add: record one value, and remember a repeated instant instead of overwriting it
    def add(self, epoch_s, value):
        if epoch_s in self.values:
            self.duplicates.add(epoch_s)
        self.values[epoch_s] = value


# ------------------------------------------------------------------------------------ #
# http_get: plain HTTPS GET that turns every transport failure into a SourceError
def http_get(url):
    """GET a URL and return the body.

    Args:
        url: absolute https URL.

    Returns:
        The response body as bytes.
    """
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise SourceError(f"HTTP {exc.code} for {url}", status=exc.code) from exc
    except (OSError, http.client.HTTPException) as exc:
        raise SourceError(f"{exc!r} for {url}") from exc


# ------------------------------------------------------------------------------------ #
# fetch_energinet: one DayAheadPrices request for every requested price area
def fetch_energinet(get, areas, start_utc, end_utc):
    """Fetch Energinet day ahead prices in EUR/MWh.

    Args:
        get: callable url -> bytes, raising SourceError.
        areas: Energinet PriceArea codes, for example ["DE", "SE3"].
        start_utc, end_utc: aware datetimes bounding the window, end exclusive.

    Returns:
        dict PriceArea -> Series.
    """
    # Energinet reads start and end as Danish local time: convert the UTC bounds
    # explicitly. The bounds are local midnights, never an ambiguous wall time.
    params = {
        "start": start_utc.astimezone(COPENHAGEN).strftime("%Y-%m-%dT%H:%M"),
        "end": end_utc.astimezone(COPENHAGEN).strftime("%Y-%m-%dT%H:%M"),
        "columns": "TimeUTC,PriceArea,DayAheadPriceEUR",
        "filter": json.dumps({"PriceArea": list(areas)}, separators=(",", ":")),
    }
    body = get(f"{ENERGINET_URL}?{urllib.parse.urlencode(params)}")
    series = {area: Series() for area in areas}
    try:
        for record in json.loads(body)["records"]:
            # TimeUTC is UTC without a designator ("2026-10-24T22:00:00"): attach UTC.
            start = dt.datetime.fromisoformat(record["TimeUTC"]).replace(tzinfo=UTC)
            series[record["PriceArea"]].add(
                int(start.timestamp()), record["DayAheadPriceEUR"]
            )
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceError(f"energinet: unexpected payload: {exc!r}") from exc
    return series


# ------------------------------------------------------------------------------------ #
# fetch_smard: the SMARD weekly quarter hour files that cover the window
def fetch_smard(get, series_ids, start_utc, end_utc):
    """Fetch SMARD chart_data day ahead prices in EUR/MWh.

    Args:
        get: callable url -> bytes, raising SourceError.
        series_ids: SMARD series ids as strings, for example ["256"].
        start_utc, end_utc: aware datetimes bounding the window, end exclusive.

    Returns:
        dict series id -> Series.
    """
    # SMARD keys each weekly file by Monday 00:00 Europe/Berlin in epoch ms, whatever
    # the zone. Walk the Berlin calendar from the Monday of the first day to the last.
    first_day = start_utc.astimezone(BERLIN).date()
    last_day = (end_utc - dt.timedelta(seconds=1)).astimezone(BERLIN).date()
    monday = first_day - dt.timedelta(days=first_day.weekday())
    mondays = []
    while monday <= last_day:
        mondays.append(monday)
        monday += dt.timedelta(days=7)
    series = {}
    for series_id in series_ids:
        series[series_id] = Series()
        for monday in mondays:
            week_start = dt.datetime.combine(monday, dt.time(0), tzinfo=BERLIN)
            url = SMARD_URL.format(id=series_id, ms=int(week_start.timestamp()) * 1000)
            try:
                body = get(url)
            except SourceError as exc:
                # Only the newest week may be absent: SMARD creates it with the
                # first auction of that week.
                if exc.status == 404 and monday == mondays[-1]:
                    continue
                raise
            try:
                for epoch_ms, value in json.loads(body)["series"]:
                    if epoch_ms % 1000:
                        raise ValueError(f"instant {epoch_ms} is not whole seconds")
                    series[series_id].add(epoch_ms // 1000, value)
            except (KeyError, TypeError, ValueError) as exc:
                raise SourceError(
                    f"smard {series_id}: unexpected payload: {exc!r}"
                ) from exc
    return series


# ------------------------------------------------------------------------------------ #
# fetch_energy_charts: Energy-Charts /price per bidding zone, SMARD data only
def fetch_energy_charts(get, zones, start_utc, end_utc):
    """Fetch Energy-Charts day ahead prices in EUR/MWh for zones it serves from SMARD.

    Args:
        get: callable url -> bytes, raising SourceError.
        zones: Energy-Charts bidding zone codes, for example ["NL"].
        start_utc, end_utc: aware datetimes bounding the window, end exclusive.

    Returns:
        dict zone -> Series.
    """
    series = {}
    for zone in zones:
        # Pass explicit UTC instants: Energy-Charts reads bare dates as Berlin days.
        # Its end bound is inclusive, so it names the start of the last quarter.
        params = {
            "bzn": zone,
            "start": start_utc.strftime("%Y-%m-%dT%H:%MZ"),
            "end": (end_utc - dt.timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%MZ"),
        }
        body = get(f"{ENERGY_CHARTS_URL}?{urllib.parse.urlencode(params)}")
        try:
            payload = json.loads(body)
            licence = payload["license_info"]
            instants, prices = payload["unix_seconds"], payload["price"]
            if len(instants) != len(prices):
                raise ValueError("unix_seconds and price differ in length")
        except (KeyError, TypeError, ValueError) as exc:
            raise SourceError(
                f"energy-charts {zone}: unexpected payload: {exc!r}"
            ) from exc
        # The credit is SMARD's: refuse the data when Energy-Charts stops naming it.
        if "SMARD" not in licence or "CC BY 4.0" not in licence:
            raise SourceError(f"energy-charts {zone}: licence is {licence!r}")
        series[zone] = Series()
        for epoch_s, value in zip(instants, prices):
            series[zone].add(epoch_s, value)
    return series


# ------------------------------------------------------------------------------------ #
# fetch_ecb_rates: the newest ECB euro reference rates
def fetch_ecb_rates(get):
    """Fetch the newest ECB euro reference rates.

    Args:
        get: callable url -> bytes, raising SourceError.

    Returns:
        (rate date as YYYY-MM-DD, dict currency -> units per EUR as published).
    """
    try:
        day = ET.fromstring(get(ECB_URL)).find(f".//{ECB_NS}Cube[@time]")
        rates = {cube.get("currency"): float(cube.get("rate")) for cube in day}
        rate_date = dt.date.fromisoformat(day.get("time")).isoformat()
    except (ET.ParseError, AttributeError, TypeError, ValueError) as exc:
        raise SourceError(f"ecb: unexpected payload: {exc!r}") from exc
    return rate_date, rates


SOURCES = {
    "energinet": {
        "fetch": fetch_energinet,
        "credit": ENERGINET_CREDIT,
        "url": "https://www.energidataservice.dk/",
    },
    "smard": {
        "fetch": fetch_smard,
        "credit": SMARD_CREDIT,
        "url": "https://www.smard.de/",
    },
    "energy-charts": {
        "fetch": fetch_energy_charts,
        "credit": SMARD_CREDIT,
        "url": "https://www.smard.de/",
    },
}
