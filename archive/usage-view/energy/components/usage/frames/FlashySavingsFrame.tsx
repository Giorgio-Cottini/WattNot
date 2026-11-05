import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "@/context/common/ThemeContext";
import { Colors } from "@/constants/Colors";
import type { HourlyPrice } from "@/domain/types";
import type { ScheduleResult } from "@/services/usage/SchedulerService";
import type { Appliance } from "@/context/usage/SettingsContext";
import SchedulerService, {
  SchedAppliance,
  SchedulerInputs,
  SlotPrice,
  SLOTS_PER_HOUR,
  DAY_SLOTS,
} from "@/services/usage/SchedulerService";
import { HOURLY_USAGE_WEIGHTS } from "@/constants/Weights";

interface FlashySavingsFrameProps {
  priceData: HourlyPrice[];
  appliances: Appliance[];
  scheduleResult: ScheduleResult | null;
  bannedHours: { start: number; end: number }[];
  maxKW: number | null;
  scheduleHorizonHours: number;
  currency: string;
  style?: ViewStyle;
}

interface CostCalculations {
  lowestCost: number;
  avgCost: number;
  maxCost: number;
}

export default function FlashySavingsFrame({
  priceData,
  appliances,
  scheduleResult,
  bannedHours,
  maxKW,
  scheduleHorizonHours,
  currency,
  style,
}: FlashySavingsFrameProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);

  const convertToSlotPrices = (prices: HourlyPrice[]): SlotPrice[] => {
    if (!prices || prices.length === 0) return [];
    const isQuarterHourly = prices.length >= 48;
    if (isQuarterHourly) {
      return prices.map((p, i) => ({ slot: i, price: p.price }));
    }
    const out: SlotPrice[] = [];
    prices.forEach((hp, h) => {
      for (let k = 0; k < SLOTS_PER_HOUR; k++) {
        out.push({ slot: h * SLOTS_PER_HOUR + k, price: hp.price });
      }
    });
    return out;
  };

  const convertAppliances = (apps: Appliance[]): SchedAppliance[] => {
    return apps
      .filter((a) => a.isActive)
      .map((app) => ({
        id: app.id,
        name: app.name,
        powerKW: app.power,
        durationSlots: Math.ceil(app.duration * SLOTS_PER_HOUR),
        canRunInBannedHours: app.canRunInBannedHours,
        timePreference: app.timePreference,
        isActive: app.isActive,
      }));
  };

  const convertBannedRanges = (ranges: { start: number; end: number }[]) => {
    return ranges.map((r) => ({
      start: r.start * SLOTS_PER_HOUR,
      end: r.end * SLOTS_PER_HOUR,
    }));
  };

  const calculateAveragePrices = (
    prices: SlotPrice[],
    bannedRanges: { start: number; end: number }[],
    hourlyPrices: HourlyPrice[]
  ): { avgPriceAll: number; avgPriceNonBanned: number } => {
    if (prices.length === 0 || hourlyPrices.length === 0) {
      return { avgPriceAll: 0, avgPriceNonBanned: 0 };
    }
    const isQuarterHourly = hourlyPrices.length >= 48;
    const getWeightForSlot = (slotIndex: number): number => {
      let hour: number;
      const hourlyIndex = isQuarterHourly
        ? slotIndex
        : Math.floor(slotIndex / SLOTS_PER_HOUR);
      if (hourlyIndex < hourlyPrices.length) {
        hour = new Date(hourlyPrices[hourlyIndex].time).getHours();
      } else {
        const hourIndexInDay = hourlyIndex % (isQuarterHourly ? DAY_SLOTS : 24);
        const refTime = hourlyPrices[hourIndexInDay]?.time;
        if (refTime) {
          hour = new Date(refTime).getHours();
        } else {
          hour = Math.floor(slotIndex / SLOTS_PER_HOUR) % 24;
        }
      }
      return HOURLY_USAGE_WEIGHTS[hour] ?? 0;
    };
    const calculateWeightedAverage = (priceSlots: SlotPrice[]): number => {
      if (priceSlots.length === 0) return 0;
      let totalWeightedPrice = 0;
      let totalWeight = 0;
      priceSlots.forEach((p) => {
        const weight = getWeightForSlot(p.slot);
        totalWeightedPrice += p.price * weight;
        totalWeight += weight;
      });
      return totalWeight > 0 ? totalWeightedPrice / totalWeight : 0;
    };
    const avgPriceAll = calculateWeightedAverage(prices);
    const bannedSlots = new Set<number>();
    for (const range of bannedRanges) {
      let slot = range.start;
      while (slot !== range.end) {
        bannedSlots.add(slot);
        slot = (slot + 1) % DAY_SLOTS;
        if (bannedSlots.size >= DAY_SLOTS) break;
      }
    }
    const validPrices = prices.filter((p) => !bannedSlots.has(p.slot));
    const avgPriceNonBanned = calculateWeightedAverage(validPrices);
    return {
      avgPriceAll,
      avgPriceNonBanned: avgPriceNonBanned > 0 ? avgPriceNonBanned : avgPriceAll,
    };
  };

  const calculateWorstCaseCost = (
    prices: SlotPrice[],
    activeAppliances: SchedAppliance[],
    bannedRanges: { start: number; end: number }[]
  ): number => {
    if (activeAppliances.length === 0) return 0;
    const relevantPrices = prices.slice(
      0,
      scheduleHorizonHours * SLOTS_PER_HOUR
    );
    const maxPrice = Math.max(...relevantPrices.map((p) => p.price), 0);
    const invertedPrices = prices.map((p) => ({
      ...p,
      price: p.price <= maxPrice ? maxPrice - p.price : 0,
    }));
    const nowSlot = 0;
    const inputs: SchedulerInputs = {
      nowSlot,
      prices: invertedPrices,
      appliances: activeAppliances,
      rules: {
        maxKW,
        bannedRanges,
        scheduleHorizonHours,
        rescheduleFromNow: false,
      },
    };
    const worstScheduleResult = SchedulerService.compute(inputs, 50);
    let totalWorstCost = 0;
    for (const assignment of worstScheduleResult.assignments) {
      const appliance = activeAppliances.find(
        (a) => a.id === assignment.applianceId
      );
      if (appliance) {
        for (
          let s = assignment.startSlot;
          s < assignment.startSlot + appliance.durationSlots;
          s++
        ) {
          const originalPrice = prices[s]?.price ?? 0;
          totalWorstCost +=
            (originalPrice * appliance.powerKW) / SLOTS_PER_HOUR;
        }
      }
    }
    return totalWorstCost;
  };

  const calculateCosts = (): CostCalculations => {
    if (!priceData || priceData.length === 0 || !scheduleResult) {
      return { lowestCost: 0, avgCost: 0, maxCost: 0 };
    }
    const activeAppliances = convertAppliances(appliances);
    if (activeAppliances.length === 0) {
      return { lowestCost: 0, avgCost: 0, maxCost: 0 };
    }
    const slotPrices = convertToSlotPrices(priceData);
    const bannedRanges = convertBannedRanges(bannedHours);
    const lowestCost = scheduleResult.totalCost;
    const { avgPriceAll, avgPriceNonBanned } = calculateAveragePrices(
      slotPrices,
      bannedRanges,
      priceData
    );
    const avgCost = activeAppliances.reduce((total, appliance) => {
      const avgPriceForAppliance = appliance.canRunInBannedHours
        ? avgPriceAll
        : avgPriceNonBanned;
      const hours = appliance.durationSlots / SLOTS_PER_HOUR;
      const applianceCost = avgPriceForAppliance * appliance.powerKW * hours;
      return total + applianceCost;
    }, 0);
    const maxCost = calculateWorstCaseCost(
      slotPrices,
      activeAppliances,
      bannedRanges
    );
    return { lowestCost, avgCost, maxCost };
  };

  const costs = calculateCosts();
  const savingsUpTo = Math.max(0, costs.maxCost - costs.lowestCost);
  const avgSavings = Math.max(0, costs.avgCost - costs.lowestCost);

  const getCurrencySymbol = (code: string): string => {
    const currencySymbols: Record<string, string> = {
      EUR: "€", SEK: "kr", NOK: "kr", DKK: "kr",
      PLN: "zł", USD: "$", GBP: "£",
    };
    return currencySymbols[code] || code;
  };

  const formatCurrency = (value: number): string[] => {
    const symbol = getCurrencySymbol(currency);
    const formattedValue = value.toFixed(2);
    return [symbol, formattedValue];
  };

  const [symbolUpTo, valueUpTo] = formatCurrency(savingsUpTo);
  const [symbolAvg, valueAvg] = formatCurrency(avgSavings);

  const activeApplianceCount = appliances.filter((a) => a.isActive).length;
  if (activeApplianceCount === 0 || !scheduleResult) return null;

  return (
    <View style={[styles.frameContainer, style]}>
      <Text style={styles.mainText}>
        Today, you can save up to:{" "}
        <Text style={styles.highlightGreen}>
          {symbolUpTo} {valueUpTo}
        </Text>
      </Text>
      <Text style={styles.subText}>
        On average:{" "}
        <Text style={styles.highlightOrange}>
          {symbolAvg} {valueAvg}
        </Text>
      </Text>
    </View>
  );
}

const getThemedStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    frameContainer: {
      backgroundColor: colors.green + "15",
      borderRadius: 20,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.green,
      marginBottom: 16,
    },
    mainText: {
      fontSize: 20,
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    subText: {
      fontSize: 16,
      color: colors.icon,
      textAlign: "center",
    },
    highlightGreen: {
      fontWeight: "bold",
      color: colors.green,
    },
    highlightOrange: {
      fontWeight: "bold",
      color: colors.orange,
    },
  });
