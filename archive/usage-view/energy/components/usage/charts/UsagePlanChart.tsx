import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/context/common/ThemeContext";
import { useSettings } from "@/context/usage/SettingsContext";
import TimeLineChart from "./TimeLineChart";
import SchedulerService, { 
  SchedAppliance, 
  SchedulerInputs, 
  ScheduleResult,
  SlotPrice,
  SLOTS_PER_HOUR
} from "@/services/usage/SchedulerService";
import type { HourlyPrice } from "@/domain/types";

export interface UsagePlanChartProps {
  priceData: HourlyPrice[]; // hourly prices
  width?: number;
  height?: number;
  onScheduleUpdate?: (result: ScheduleResult) => void;
}

export default function UsagePlanChart({
  priceData,
  width = 0,
  height = 200,
  onScheduleUpdate,
}: UsagePlanChartProps) {
  const { colors } = useTheme();
  const { appliances, houseSettings } = useSettings();
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  
  const handleLayout = useCallback((e: any) => {
    const w = e?.nativeEvent?.layout?.width ?? 0;
    if (w && Math.abs(w - containerWidth) > 1) {
      setContainerWidth(w);
    }
  }, [containerWidth]);
  
  const resolvedWidth = containerWidth > 0 ? containerWidth : (width > 0 ? width : 340);

  // Convert to 15‑min slots; accept hourly or quarter-hour input
  const convertToSlotPrices = (prices: HourlyPrice[]): SlotPrice[] => {
    if (!prices || prices.length === 0) return [];
    const isQuarterHourly = prices.length >= 48;
    if (isQuarterHourly) return prices.map((p, i) => ({ slot: i, price: p.price }));
    const out: SlotPrice[] = [];
    prices.forEach((hp, h) => {
      for (let k = 0; k < SLOTS_PER_HOUR; k++) out.push({ slot: h * SLOTS_PER_HOUR + k, price: hp.price });
    });
    return out;
  };

  // Convert appliances to scheduler format
  const convertAppliances = (apps: typeof appliances): SchedAppliance[] => {
    return apps.map(app => ({
      id: app.id,
      name: app.name,
      powerKW: app.power,
      durationSlots: Math.ceil(app.duration * SLOTS_PER_HOUR), // hours to 15-min slots
      canRunInBannedHours: app.canRunInBannedHours,
      timePreference: app.timePreference,
      isActive: app.isActive,
    }));
  };

  // Convert banned hours to slot ranges
  const convertBannedRanges = (ranges: typeof houseSettings.bannedHours) => {
    return ranges.map(r => ({
      start: r.start * SLOTS_PER_HOUR, // hour to 15-min slot
      end: r.end * SLOTS_PER_HOUR,
    }));
  };

  // Run scheduler
  useEffect(() => {
    if (!priceData || priceData.length === 0) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const nowSlot = currentHour * SLOTS_PER_HOUR + Math.floor(currentMinute / (60 / SLOTS_PER_HOUR));

    const inputs: SchedulerInputs = {
      nowSlot,
      prices: convertToSlotPrices(priceData),
      appliances: convertAppliances(appliances.filter(a => a.isActive)),
      rules: {
        maxKW: houseSettings.maxKW,
        bannedRanges: convertBannedRanges(houseSettings.bannedHours),
        scheduleHorizonHours: houseSettings.scheduleHorizonHours || 24,
        rescheduleFromNow: houseSettings.rescheduleFromNow,
      },
    };

    const result = SchedulerService.compute(inputs, 100);
    setScheduleResult(result);
    onScheduleUpdate?.(result);
  }, [priceData, appliances, houseSettings]);

  if (!priceData || priceData.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={[styles.noDataText, { color: colors.icon }]}>
          No price data available
        </Text>
      </View>
    );
  }

  return (
    <View 
      style={styles.container}
      onLayout={handleLayout}
    >
      <TimeLineChart
        priceData={priceData}
        appliances={appliances}
        scheduleResult={scheduleResult}
        width={resolvedWidth}
        height={height}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noDataText: {
    fontSize: 14,
    textAlign: "center",
    padding: 20,
  },
});
