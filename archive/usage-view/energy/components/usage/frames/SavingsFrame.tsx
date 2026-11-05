import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import FrameColouredTop from "@/components/common/frames/FrameColouredTop";
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
  DAY_SLOTS
} from "@/services/usage/SchedulerService";
import { HOURLY_USAGE_WEIGHTS } from "@/constants/Weights";

interface SavingsFrameProps {
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

export default function SavingsFrame({
  priceData,
  appliances,
  scheduleResult,
  bannedHours,
  maxKW,
  scheduleHorizonHours,
  currency,
  style,
}: SavingsFrameProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);

  // Convert prices to 15‑min slots; accept hourly or quarter-hour input
  const convertToSlotPrices = (prices: HourlyPrice[]): SlotPrice[] => {
    if (!prices || prices.length === 0) return [];
    const isQuarterHourly = prices.length >= 48; // heuristic
    if (isQuarterHourly) {
      return prices.map((p, i) => ({ slot: i, price: p.price }));
    }
    const out: SlotPrice[] = [];
    prices.forEach((hp, h) => {
      for (let k = 0; k < SLOTS_PER_HOUR; k++) out.push({ slot: h * SLOTS_PER_HOUR + k, price: hp.price });
    });
    return out;
  };

  // Convert appliances to scheduler format
  const convertAppliances = (apps: Appliance[]): SchedAppliance[] => {
    return apps.filter(a => a.isActive).map(app => ({
      id: app.id,
      name: app.name,
      powerKW: app.power,
      durationSlots: Math.ceil(app.duration * SLOTS_PER_HOUR),
      canRunInBannedHours: app.canRunInBannedHours,
      timePreference: app.timePreference,
      isActive: app.isActive,
    }));
  };

  // Convert banned hours to slot ranges
  const convertBannedRanges = (ranges: { start: number; end: number }[]) => {
    return ranges.map(r => ({
      start: r.start * SLOTS_PER_HOUR,
      end: r.end * SLOTS_PER_HOUR,
    }));
  };

  // Calculate average price for all hours, and for non-banned hours
  const calculateAveragePrices = (
    prices: SlotPrice[],
    bannedRanges: { start: number; end: number }[],
    hourlyPrices: HourlyPrice[]
  ): { avgPriceAll: number; avgPriceNonBanned: number } => {
    if (prices.length === 0 || hourlyPrices.length === 0) {
      return { avgPriceAll: 0, avgPriceNonBanned: 0 };
    }

    // Heuristic to check if source data is hourly or quarter-hourly
    const isQuarterHourly = hourlyPrices.length >= 48;

    const getWeightForSlot = (slotIndex: number): number => {
      let hour: number;
      const hourlyIndex = isQuarterHourly ? slotIndex : Math.floor(slotIndex / SLOTS_PER_HOUR);

      if (hourlyIndex < hourlyPrices.length) {
        hour = new Date(hourlyPrices[hourlyIndex].time).getHours();
      } else {
        // Fallback for slots outside of known price data (e.g., extended horizon)
        // We assume the daily pattern of hours repeats.
        const dayIndex = Math.floor(hourlyIndex / (isQuarterHourly ? DAY_SLOTS : 24));
        const hourIndexInDay = hourlyIndex % (isQuarterHourly ? DAY_SLOTS : 24);
        const refTime = hourlyPrices[hourIndexInDay]?.time;
        if (refTime) {
          hour = new Date(refTime).getHours();
        } else {
          // Final fallback: use slot index to determine hour cyclically
          hour = Math.floor(slotIndex / SLOTS_PER_HOUR) % 24;
        }
      }
      return HOURLY_USAGE_WEIGHTS[hour] ?? 0;
    };

    // Calculate weighted average for a given set of prices
    const calculateWeightedAverage = (priceSlots: SlotPrice[]): number => {
      if (priceSlots.length === 0) return 0;
      
      let totalWeightedPrice = 0;
      let totalWeight = 0;

      priceSlots.forEach(p => {
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
        if (bannedSlots.size >= DAY_SLOTS) break; // safety break
      }
    }

    const validPrices = prices.filter(p => !bannedSlots.has(p.slot));
    const avgPriceNonBanned = calculateWeightedAverage(validPrices);

    return { 
      avgPriceAll, 
      avgPriceNonBanned: avgPriceNonBanned > 0 ? avgPriceNonBanned : avgPriceAll 
    };
  };


  // Calculate worst-case cost by finding the most expensive valid schedule
  const calculateWorstCaseCost = (
    prices: SlotPrice[],
    activeAppliances: SchedAppliance[],
    bannedRanges: { start: number; end: number }[]
  ): number => {
    if (activeAppliances.length === 0) return 0;
    
    // To find the worst schedule, we find the best schedule with inverted prices
    const relevantPrices = prices.slice(0, scheduleHorizonHours * SLOTS_PER_HOUR);
    const maxPrice = Math.max(...relevantPrices.map(p => p.price), 0);
    const invertedPrices = prices.map(p => ({
      ...p,
      price: p.price <= maxPrice ? maxPrice - p.price : 0, // Invert, handle future prices
    }));

    const now = new Date();
    // Align with the schedule baseline used elsewhere (start of day)
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
    
    // Now, calculate the cost of this "worst" schedule using the original prices
    let totalWorstCost = 0;
    for (const assignment of worstScheduleResult.assignments) {
      const appliance = activeAppliances.find(a => a.id === assignment.applianceId);
      if (appliance) {
        for (let s = assignment.startSlot; s < assignment.startSlot + appliance.durationSlots; s++) {
          const originalPrice = prices[s]?.price ?? 0; // EUR/kWh
          totalWorstCost += (originalPrice * appliance.powerKW) / SLOTS_PER_HOUR; // kW * hour_fraction
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

    // 1. Lowest cost: from the optimal schedule (already correctly calculated by scheduler)
    const lowestCost = scheduleResult.totalCost;

    // 2. Average cost: based on two different average prices
    const { avgPriceAll, avgPriceNonBanned } = calculateAveragePrices(slotPrices, bannedRanges, priceData);
    
    const avgCost = activeAppliances.reduce((total, appliance) => {
      const avgPriceForAppliance = appliance.canRunInBannedHours ? avgPriceAll : avgPriceNonBanned; // EUR/kWh
      const hours = appliance.durationSlots / SLOTS_PER_HOUR;
      // Cost = price [EUR/kWh] * power [kW] * hours [h]
      const applianceCost = avgPriceForAppliance * appliance.powerKW * hours;
      return total + applianceCost;
    }, 0);
    
    // 3. Max cost: worst case scenario from scheduler
    const maxCost = calculateWorstCaseCost(slotPrices, activeAppliances, bannedRanges);

    return { lowestCost, avgCost, maxCost };
  };

  const costs = calculateCosts();

  // Format currency values
  const getCurrencySymbol = (code: string): string => {
    const currencySymbols: Record<string, string> = {
      EUR: "€",
      SEK: "kr",
      NOK: "kr",
      DKK: "kr",
      PLN: "zł",
      USD: "$",
      GBP: "£",
    };
    return currencySymbols[code] || code;
  };

  const formatCurrency = (value: number): string => {
    return `${getCurrencySymbol(currency)} ${value.toFixed(2)}`;
  };

  if (!priceData || priceData.length === 0) {
    return (
      <FrameColouredTop 
        currentPrice={null}
        style={StyleSheet.flatten([styles.frameContainer, style])}
        topContent={
          <View style={styles.headerContent}>
            <Text style={styles.titleText}>Cost Comparison</Text>
            <Text style={styles.subtitleText}>Optimize your electricity usage</Text>
          </View>
        }
      >
        <Text style={[styles.noDataText, { color: colors.icon }]}>
          No price data available for savings calculation
        </Text>
      </FrameColouredTop>
    );
  }

  const activeApplianceCount = appliances.filter(a => a.isActive).length;
  
  if (activeApplianceCount === 0) {
    return (
      <FrameColouredTop 
        currentPrice={null}
        style={StyleSheet.flatten([styles.frameContainer, style])}
        topContent={
          <View style={styles.headerContent}>
            <Text style={styles.titleText}>Cost Comparison</Text>
            <Text style={styles.subtitleText}>Optimize your electricity usage</Text>
          </View>
        }
      >
        <Text style={[styles.noDataText, { color: colors.icon }]}>
          No active appliances selected
        </Text>
      </FrameColouredTop>
    );
  }

  return (
    <FrameColouredTop 
      currentPrice={null}
      style={StyleSheet.flatten([styles.frameContainer, style])}
      topContent={
        <View style={styles.headerContent}>
          <Text style={styles.titleText}>Cost Comparison</Text>
          <Text style={styles.subtitleText}>Optimize your electricity usage</Text>
        </View>
      }
    >
      <View style={styles.contentContainer}>
        {/* Optimal Cost Row */}
        <View style={styles.costRow}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.tint }]}>
              <Text style={styles.iconText}>⚡</Text>
            </View>
          </View>
          <View style={styles.costInfo}>
            <Text style={styles.costTitle}>Optimal Cost</Text>
            <Text style={styles.costSubtitle}>Best possible rate today</Text>
          </View>
          <View style={styles.costValueContainer}>
            <Text style={[styles.costAmount, { color: colors.text }]}>
              {formatCurrency(costs.lowestCost)}
            </Text>
          </View>
        </View>

        {/* Average Cost Row */}
        <View style={styles.costRow}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.green + '40' }]}>
              <Text style={styles.iconText}>💰</Text>
            </View>
          </View>
          <View style={styles.costInfo}>
            <Text style={styles.costTitle}>Average Cost</Text>
            <Text style={styles.costSubtitle}>Weighted average usage</Text>
          </View>
          <View style={styles.costValueContainer}>
            <Text style={[styles.costAmount, { color: colors.text }]}>
              {formatCurrency(costs.avgCost)}
            </Text>
          </View>
        </View>

        {/* Peak Hour Cost Row */}
        <View style={[styles.costRow, styles.lastCostRow]}>
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.orange + '40' }]}>
              <Text style={styles.iconText}>📈</Text>
            </View>
          </View>
          <View style={styles.costInfo}>
            <Text style={styles.costTitle}>Worst Case Cost</Text>
            <Text style={styles.costSubtitle}>Most expensive schedule</Text>
          </View>
          <View style={styles.costValueContainer}>
            <Text style={[styles.costAmount, { color: colors.orange }]}>
              {formatCurrency(costs.maxCost)}
            </Text>
          </View>
        </View>
      </View>
    </FrameColouredTop>
  );
}

const getThemedStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    frameContainer: {
      marginBottom: 16,
    },
    headerContent: {
      alignItems: "center",
    },
    titleText: {
      fontSize: 22,
      fontWeight: "bold",
      color: "#FFFFFF",
      textAlign: "center",
      marginBottom: 4,
    },
    subtitleText: {
      fontSize: 16,
      color: "#FFFFFF",
      opacity: 0.9,
      textAlign: "center",
    },
    contentContainer: {
      padding: 0,
    },
    noDataText: {
      fontSize: 14,
      textAlign: "center",
      padding: 20,
    },
    costRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 7,
      paddingVertical: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon + "20",
    },
    iconContainer: {
      marginRight: 16,
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
    },
    iconText: {
      fontSize: 20,
    },
    costInfo: {
      flex: 1,
    },
    costTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 2,
    },
    costSubtitle: {
      fontSize: 14,
      color: colors.icon,
    },
    costValueContainer: {
      alignItems: "flex-end",
    },
    costAmount: {
      fontSize: 20,
      fontWeight: "bold",
    },
    lastCostRow: {
      borderBottomWidth: 0,
    },
  });
