// The bidding zones of the picker (PLAN.md section 2) and the first run guess
// of the zone from the device time zone (D20).

export type Currency = "EUR" | "DKK" | "NOK" | "SEK" | "PLN";

export type CoveredZoneCode =
  | "GER"
  | "DK1"
  | "DK2"
  | "NO2"
  | "SE3"
  | "SE4"
  | "NL"
  | "PL";

export type UncoveredZoneCode =
  | "FI"
  | "EE"
  | "LV"
  | "NO1"
  | "NO3"
  | "NO4"
  | "NO5"
  | "SE1"
  | "SE2";

export type ZoneCode = CoveredZoneCode | UncoveredZoneCode;

interface ZoneBase {
  name: string;
  // The code people know, shown on screen. The key `code` stays in the data paths.
  shownCode: string;
  tz: string;
  currency: Currency;
  // Local subunit shown per kWh (D16).
  subunit: string;
}

export interface CoveredZone extends ZoneBase {
  code: CoveredZoneCode;
  covered: true;
  // Credit of the zone's primary source. A day's payload names the source
  // actually used (source.credit), which wins for that day.
  credit: string;
}

export interface UncoveredZone extends ZoneBase {
  code: UncoveredZoneCode;
  covered: false;
  // Nord Pool's public price page for the area (D01b).
  link: string;
}

export type Zone = CoveredZone | UncoveredZone;

const ENERGINET = "Source: Energinet (www.energidataservice.dk), CC BY 4.0.";
const SMARD = "Source: Bundesnetzagentur | SMARD.de, CC BY 4.0.";

const SUBUNIT: Record<Currency, string> = {
  EUR: "c",
  SEK: "öre",
  NOK: "øre",
  DKK: "øre",
  PLN: "gr",
};

// The public code of the German and Luxembourg zone (ENTSO-E, Nord Pool, SMARD).
const SHOWN_CODE: Partial<Record<CoveredZoneCode, string>> = { GER: "DE-LU" };

function covered(
  code: CoveredZoneCode,
  name: string,
  tz: string,
  currency: Currency,
  credit: string,
): CoveredZone {
  return {
    code,
    name,
    shownCode: SHOWN_CODE[code] ?? code,
    tz,
    currency,
    subunit: SUBUNIT[currency],
    covered: true,
    credit,
  };
}

function uncovered(
  code: UncoveredZoneCode,
  name: string,
  tz: string,
  currency: Currency,
): UncoveredZone {
  const link =
    "https://data.nordpoolgroup.com/auction/day-ahead/prices?deliveryDate=latest" +
    `&currency=EUR&aggregation=DeliveryPeriod&deliveryAreas=${code}`;
  return {
    code,
    name,
    shownCode: code,
    tz,
    currency,
    subunit: SUBUNIT[currency],
    covered: false,
    link,
  };
}

// Picker order: the 8 covered zones, then the 9 that are not available yet.
export const ZONE_LIST: readonly Zone[] = [
  covered("GER", "Germany and Luxembourg", "Europe/Berlin", "EUR", ENERGINET),
  covered("DK1", "Denmark West", "Europe/Copenhagen", "DKK", ENERGINET),
  covered("DK2", "Denmark East", "Europe/Copenhagen", "DKK", ENERGINET),
  covered("NO2", "Norway Southwest", "Europe/Oslo", "NOK", ENERGINET),
  covered("SE3", "Sweden Central", "Europe/Stockholm", "SEK", ENERGINET),
  covered("SE4", "Sweden South", "Europe/Stockholm", "SEK", ENERGINET),
  covered("NL", "Netherlands", "Europe/Amsterdam", "EUR", SMARD),
  covered("PL", "Poland", "Europe/Warsaw", "PLN", SMARD),
  uncovered("FI", "Finland", "Europe/Helsinki", "EUR"),
  uncovered("EE", "Estonia", "Europe/Tallinn", "EUR"),
  uncovered("LV", "Latvia", "Europe/Riga", "EUR"),
  uncovered("NO1", "Norway East", "Europe/Oslo", "NOK"),
  uncovered("NO3", "Norway Central", "Europe/Oslo", "NOK"),
  uncovered("NO4", "Norway North", "Europe/Oslo", "NOK"),
  uncovered("NO5", "Norway West", "Europe/Oslo", "NOK"),
  uncovered("SE1", "Sweden North", "Europe/Stockholm", "SEK"),
  uncovered("SE2", "Sweden North-central", "Europe/Stockholm", "SEK"),
];

export const ZONES = Object.fromEntries(
  ZONE_LIST.map((z) => [z.code, z]),
) as Record<ZoneCode, Zone>;

export function isZoneCode(value: unknown): value is ZoneCode {
  return ZONE_LIST.some((z) => z.code === value);
}

export interface ZoneGuess {
  // The zone the confirm sheet preselects.
  preselected: ZoneCode;
  // One zone: confirm in one tap. Several (SE, NO, DK): ask which.
  options: readonly ZoneCode[];
}

// Device time zone to zone options. SE, NO and DK preselect their covered zone
// with the largest population: SE3, NO2 (the only covered one), DK1.
const GUESSES = new Map<string, ZoneGuess>([
  ["Europe/Berlin", { preselected: "GER", options: ["GER"] }],
  ["Europe/Luxembourg", { preselected: "GER", options: ["GER"] }],
  ["Europe/Amsterdam", { preselected: "NL", options: ["NL"] }],
  ["Europe/Warsaw", { preselected: "PL", options: ["PL"] }],
  [
    "Europe/Stockholm",
    { preselected: "SE3", options: ["SE1", "SE2", "SE3", "SE4"] },
  ],
  [
    "Europe/Oslo",
    { preselected: "NO2", options: ["NO1", "NO2", "NO3", "NO4", "NO5"] },
  ],
  ["Europe/Copenhagen", { preselected: "DK1", options: ["DK1", "DK2"] }],
  ["Europe/Helsinki", { preselected: "FI", options: ["FI"] }],
  ["Europe/Mariehamn", { preselected: "FI", options: ["FI"] }],
  ["Europe/Tallinn", { preselected: "EE", options: ["EE"] }],
  ["Europe/Riga", { preselected: "LV", options: ["LV"] }],
]);

// Null when the device time zone belongs to no zone: the picker opens instead.
export function inferZone(deviceTz: string | undefined): ZoneGuess | null {
  return (deviceTz && GUESSES.get(deviceTz)) || null;
}
