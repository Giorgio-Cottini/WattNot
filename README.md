# WattNot

A free iPhone app for households on a dynamic electricity tariff. It shows the day-ahead price of one bidding zone
for today and tomorrow, and the cheapest time to start a load of 1 to 4 hours, such as a dishwasher.

- `energy/`: the app (React Native, Expo, TypeScript).
- `lambda/`: the publisher that fetches public prices and writes one JSON object per zone and day.
- `release/`: the icon and the support and privacy pages.
- `archive/`: the Usage view, which is not in the build.

Prices come only from sources that permit reuse: Energinet and SMARD under CC BY 4.0, with ECB reference rates for
currency conversion. Other zones link to the public page of Nord Pool.

## License

The code is under the Apache License 2.0. The price data files are under CC BY 4.0. See `NOTICE`.
