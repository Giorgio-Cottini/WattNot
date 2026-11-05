# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

Households on a dynamic electricity tariff. Their bill follows the day-ahead spot price, and they decide when to
run the dishwasher or the laundry, charge an EV, or heat water. People who only follow the market can use the app,
but no design decision serves them first.

## Product Purpose

WattNot shows the day-ahead spot price of one bidding zone for today and tomorrow, and the cheapest time to start a
load of 1 to 4 hours. Success: within two seconds of the open, the user knows the price now and the best start time.

## Positioning

A glance with no account. One screen, no login, no data collected, and the answer in two seconds. A supplier app
needs an account and a contract. A price website needs navigation.

## Operating Context

The app opens at any moment of the day. The owner expects more opens in the morning and after 13:00, when
tomorrow's prices arrive. The real distribution is unknown.

## Capabilities and Constraints

- `docs/overhaul/PLAN.md` is the source of truth for scope, the data contract and every decision ID below.
- 8 zones with licensed data: GER, DK1, DK2, NO2, SE3, SE4, NL, PL. The 9 other Nord Pool zones stay in the
  picker as "Not available yet", with a link to the public Nord Pool page (D01b).
- Today and Tomorrow only. Tomorrow arrives after about 13:00 CET (D27).
- Day-ahead spot price, excl. VAT, taxes, grid fees and supplier margin (D17). Local subunit per kWh with 2
  decimals. A converted price shows without "≈", and the footer names the ECB rate date (D03, D16).
- Quarter-hour data. The now block and the next hour show hourly means. Min and max are quarters. The chart
  steps by the hour and reads quarters on touch (D12).
- Four levels against the previous 7 days: cheap, normal, expensive and very expensive, the last above the
  upper Tukey fence. Plus "zero or negative". The word "free" is never used (D14, D15).
- Light appearance, English, iPhone only, no push, no web target (D21, D24, D22, D04, D25).
- A wrong displayed price is a legal risk. A price the contract does not back never shows.

## Brand Commitments

- Name WattNot. The mark is six blocks in `release/icon/icon.svg` (branch `overhaul/release`) on `--bg` #10263f.
  The app's price colours and the icon variables are one palette, "Signal", chosen with the owner on 2026-10-26:
  zero or negative #2276b0, cheap #4fb874, normal #c9d3de, expensive #efbf3a, very expensive #b8327a. A change to
  one changes both.
- Voice: factual and plain, no marketing claims. The caption of D17 and the source credits of PLAN section 2 are
  fixed text.

## Evidence on Hand

- Real recorded payloads: `energy/lib/fixtures/` and `lambda/fixtures/`.
- Store text: `release/APP_STORE.md` (branch `overhaul/release`).
- No users, reviews, testimonials or usage data exist. Do not invent any.

## Product Principles

1. The answer comes first: the price now and the best start time sit above the fold.
2. Exact or absent: an empty state names what is missing and when it arrives.
3. Nothing to sign in to, nothing collected.
4. Native iOS behaviour before custom invention.

## Accessibility & Inclusion

A colour-blind-safe level palette, the level word on every coloured fill, text contrast of at least 4.5:1, a
chart that VoiceOver can adjust through the hours, 44 pt targets, Dynamic Type without clipping, and Reduce Motion
honoured (PLAN section 4). The price of the next hour and the min and max prices carry their level only as the hue
of the text. VoiceOver reads the word.
