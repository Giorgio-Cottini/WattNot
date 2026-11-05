"""Local mode: python -m wattnot_prices --out DIR [--date YYYY-MM-DD].

Writes the same objects as the Lambda under DIR/v1/prices/ with live GETs to the sources.
"""

# stdlib
import argparse
import datetime as dt

# local
from .publish import DirStore, run
from .sources import http_get

parser = argparse.ArgumentParser(prog="python -m wattnot_prices")
parser.add_argument("--out", required=True, help="directory that receives v1/prices/")
parser.add_argument(
    "--date",
    type=dt.date.fromisoformat,
    help="one local day to publish (default: today and tomorrow in Europe/Berlin)",
)
args = parser.parse_args()
run(
    DirStore(args.out),
    http_get,
    dt.datetime.now(dt.timezone.utc),
    [args.date] if args.date else None,
)
