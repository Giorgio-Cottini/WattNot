"""AWS Lambda entry point: wattnot_prices.handler.handler."""

# stdlib
import datetime as dt
import os

# third-party
import boto3

# local
from .publish import ZONES, S3Store, run
from .sources import http_get

STORE = S3Store(
    boto3.client("s3"),
    boto3.client("cloudfront"),
    os.environ["BUCKET"],
    os.environ["DISTRIBUTION_ID"],
)


# ------------------------------------------------------------------------------------ #
# handler: one scheduled run, or a manual one for a given date, zones and force flag
def handler(event, context):
    """Run the publisher.

    Args:
        event: {} from the schedule. A manual invocation may pass "date"
            ("YYYY-MM-DD"), "zones" (list of zone codes) and "force" (true rewrites
            existing objects and invalidates their paths).
        context: Lambda context, unused.

    Returns:
        The run summary.
    """
    unknown = set(event) - {"date", "zones", "force"}
    if unknown:
        raise ValueError(f"unknown event keys {sorted(unknown)}")
    days = [dt.date.fromisoformat(event["date"])] if "date" in event else None
    codes = event.get("zones", [zone.code for zone in ZONES])
    zones = [zone for zone in ZONES if zone.code in codes]
    if len(zones) != len(set(codes)):
        raise ValueError(f"unknown zone in {codes}")
    force = event.get("force", False)
    if not isinstance(force, bool):
        raise ValueError(f"force must be a boolean, got {force!r}")
    return run(STORE, http_get, dt.datetime.now(dt.timezone.utc), days, zones, force)
