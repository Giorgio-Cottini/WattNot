import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
} from "react-native";
import FloatingBottomBar from "@/components/common/navigation/FloatingBottomBar";
import { useTheme } from "@/context/common/ThemeContext";
import { Colors } from "@/constants/Colors";
import UsageChartFrame from "@/components/usage/frames/UsageChartFrame";
import AppliancesFrame from "@/components/usage/frames/AppliancesFrame";
import SavingsFrame from "@/components/usage/frames/SavingsFrame";
import FlashySavingsFrame from "@/components/usage/frames/FlashySavingsFrame";
import SchedulerService, { 
  SchedAppliance, 
  SchedulerInputs, 
  ScheduleResult,
  SlotPrice,
  SLOTS_PER_HOUR
} from "@/services/usage/SchedulerService";
import { useSettings, type Appliance, MAX_APPLIANCES } from "@/context/usage/SettingsContext";
import PriceDataService from "@/services/prices/PriceDataService";
import { useRegions } from "@/context/common/RegionContext";

// Default appliances
const DEFAULT_APPLIANCES: Omit<Appliance, "id" | "isActive">[] = [
  { name: "Oven", power: 2.5, duration: 1, timePreference: "no_preference", canRunInBannedHours: false, isDefault: true },
  { name: "Dishwasher", power: 1.8, duration: 2, timePreference: "night", canRunInBannedHours: false, isDefault: true },
  { name: "Washing Machine", power: 2.2, duration: 1.5, timePreference: "no_preference", canRunInBannedHours: false, isDefault: true },
  { name: "Electric Car Charger", power: 7.4, duration: 4, timePreference: "night", canRunInBannedHours: false, isDefault: true },
  { name: "Clothes Dryer", power: 3.0, duration: 1.5, timePreference: "no_preference", canRunInBannedHours: false, isDefault: true },
  { name: "Pressure Washer", power: 1.5, duration: 0.5, timePreference: "day", canRunInBannedHours: false, isDefault: true },
  { name: "Air Conditioner", power: 3.5, duration: 3, timePreference: "day", canRunInBannedHours: true, isDefault: true },
  { name: "Pool Pump", power: 1.2, duration: 6, timePreference: "night", canRunInBannedHours: false, isDefault: true },
  { name: "Water Heater", power: 4.0, duration: 2, timePreference: "night", canRunInBannedHours: false, isDefault: true },
];

export default function Usage() {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);
  const { appliances, houseSettings, isLoaded, addAppliance, updateAppliance, deleteAppliance, updateHouseSettings } = useSettings();
  const { primaryRegion } = useRegions();

  // Local UI state only
  const [selectedDefaults, setSelectedDefaults] = useState<Set<string>>(new Set());
  const [priceData, setPriceData] = useState<any[]>([]);
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  const [currency, setCurrency] = useState<string>("EUR");

  // Toggle appliance activation
  const toggleApplianceActivation = (id: string) => {
    const appliance = appliances.find(app => app.id === id);
    if (appliance) {
      updateAppliance(id, { isActive: !appliance.isActive });
    }
  };

  // Toggle default appliance selection
  const toggleDefaultAppliance = (name: string) => {
    const newSelected = new Set(selectedDefaults);
    if (newSelected.has(name)) {
      newSelected.delete(name);
      // Remove from appliances list if it exists
      const existingAppliance = appliances.find(app => app.name === name && app.isDefault);
      if (existingAppliance) {
        deleteAppliance(existingAppliance.id);
      }
    } else {
      newSelected.add(name);
      // Add to appliances list
      const defaultApp = DEFAULT_APPLIANCES.find(app => app.name === name);
      if (defaultApp) {
        addAppliance({
          ...defaultApp,
          isActive: true,
        });
      }
    }
    setSelectedDefaults(newSelected);
  };


  // Convert helpers for scheduler (accepts hourly or quarter-hour input)
  const convertToSlotPrices = React.useCallback((series: any[]): SlotPrice[] => {
    if (!series || series.length === 0) return [];
    const isQuarterHourly = series.length >= 48; // heuristic without metadata
    if (isQuarterHourly) {
      // Already 15-min granularity: one slot per item
      return series.map((p, i) => ({ slot: i, price: p.price }));
    }
    // Hourly input: expand to 15‑minute slots
    const out: SlotPrice[] = [];
    series.forEach((p, h) => {
      for (let k = 0; k < SLOTS_PER_HOUR; k++) {
        out.push({ slot: h * SLOTS_PER_HOUR + k, price: p.price });
      }
    });
    return out;
  }, []);

  const convertAppliances = React.useCallback((apps: Appliance[]): SchedAppliance[] => {
    return apps.filter(a => a.isActive).map(app => ({
      id: app.id,
      name: app.name,
      powerKW: app.power,
      durationSlots: Math.ceil(app.duration * 4), // Duration in 15-minute slots (4 slots per hour)
      canRunInBannedHours: app.canRunInBannedHours,
      timePreference: app.timePreference,
      isActive: app.isActive,
    }));
  }, []);

  const convertBannedRanges = React.useCallback((ranges: { start: number; end: number }[]) => {
    return ranges.map(r => ({ start: r.start * 4, end: r.end * 4 })); // Convert hours to 15-minute slots
  }, []);

  const computeSchedule = React.useCallback(() => {
    if (!priceData || priceData.length === 0) {
      setScheduleResult(null);
      return;
    }
    // Default to starting from 00:00 (slot 0) with 24-hour horizon
    const nowSlot = 0;

    const inputs: SchedulerInputs = {
      nowSlot,
      prices: convertToSlotPrices(priceData),
      appliances: convertAppliances(appliances),
      rules: {
        maxKW: houseSettings.maxKW ?? null,
        bannedRanges: convertBannedRanges(houseSettings.bannedHours),
        scheduleHorizonHours: houseSettings.scheduleHorizonHours || 24,
        // Schedule within the horizon hours, filtering out non-existing data
        noAfterHours: Math.min(houseSettings.scheduleHorizonHours || 24, priceData.length),
        rescheduleFromNow: false,
      },
    };
    const result = SchedulerService.compute(inputs, 100);
    setScheduleResult(result);
  }, [priceData, appliances, houseSettings, convertToSlotPrices, convertAppliances, convertBannedRanges]);

  // Load price data
  React.useEffect(() => {
    const loadPrices = async () => {
      try {
        const regionToUse = primaryRegion || 'FI';
        const todayData = await PriceDataService.getPriceData('today', regionToUse);
        if (todayData?.prices) {
          setPriceData(todayData.prices);
          if (todayData.currency) {
            setCurrency(todayData.currency);
          }
        }
      } catch (error) {
        console.error('Error loading price data:', error);
      }
    };
    loadPrices();
  }, [primaryRegion]);

  // Recompute schedule when dependencies change
  React.useEffect(() => {
    computeSchedule();
  }, [computeSchedule]);

  // Show loading while settings are being loaded
  if (!isLoaded) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.text }}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.contentContainer}>
        
        {/* 1. Flashy Savings Frame */}
        {priceData.length > 0 && (
          <FlashySavingsFrame
            priceData={priceData}
            appliances={appliances}
            scheduleResult={scheduleResult}
            bannedHours={houseSettings.bannedHours}
            maxKW={houseSettings.maxKW}
            scheduleHorizonHours={houseSettings.scheduleHorizonHours || 24}
            currency={currency}
          />
        )}
        
        {/* 2. Savings Frame */}
        {priceData.length > 0 && (
          <SavingsFrame
            priceData={priceData}
            appliances={appliances}
            scheduleResult={scheduleResult}
            bannedHours={houseSettings.bannedHours}
            maxKW={houseSettings.maxKW}
            scheduleHorizonHours={houseSettings.scheduleHorizonHours || 24}
            currency={currency}
          />
        )}

        {/* 3. Standalone Chart Frame */}
        {priceData.length > 0 && (
          <UsageChartFrame
            priceData={priceData}
            appliances={appliances}
            scheduleResult={scheduleResult}
            scheduleHorizonHours={houseSettings.scheduleHorizonHours || 24}
            maxAvailableHours={24}
            onScheduleHorizonChange={(hours) => {
              updateHouseSettings({ scheduleHorizonHours: hours });
            }}
            onReschedule={(selectedApplianceIds, horizonHours) => {
              // Update horizon hours
              updateHouseSettings({ scheduleHorizonHours: horizonHours });
              
              // Filter appliances to only include selected ones for scheduling
              const filteredAppliances = appliances.map(app => ({
                ...app,
                isActive: selectedApplianceIds.includes(app.id) && app.isActive
              }));
              
              // Recompute schedule with filtered appliances
              const nowSlot = 0;
              const inputs: SchedulerInputs = {
                nowSlot,
                prices: convertToSlotPrices(priceData),
                appliances: convertAppliances(filteredAppliances),
                rules: {
                  maxKW: houseSettings.maxKW ?? null,
                  bannedRanges: convertBannedRanges(houseSettings.bannedHours),
                  scheduleHorizonHours: horizonHours,
                  noAfterHours: Math.min(horizonHours, priceData.length),
                  rescheduleFromNow: false,
                },
              };
              const result = SchedulerService.compute(inputs, 100);
              setScheduleResult(result);
            }}
          />
        )}
        
        {/* 4. Combined House Settings and Appliances Frame */}
        <AppliancesFrame
          title={houseSettings.title}
          bannedHours={houseSettings.bannedHours}
          maxKW={houseSettings.maxKW}
          appliances={appliances}
          maxAppliances={MAX_APPLIANCES}
          onSettingsChange={(updates) => {
            updateHouseSettings(updates);
          }}
          onAddAppliance={(applianceData) => {
            addAppliance({
              ...applianceData,
              isActive: true,
            });
          }}
          onUpdateAppliance={updateAppliance}
          onDeleteAppliance={deleteAppliance}
          onToggleActivation={toggleApplianceActivation}
        />

        {/* 5. Quick Add Appliances (untouched) */}
        <View style={styles.defaultAppliancesSection}>
          <Text style={styles.sectionTitle}>Quick Add Appliances</Text>
          <View style={styles.defaultAppliancesGrid}>
            {DEFAULT_APPLIANCES.map((app) => (
              <TouchableOpacity
                key={app.name}
                style={[
                  styles.defaultApplianceCard,
                  selectedDefaults.has(app.name) && styles.defaultApplianceCardSelected,
                  selectedDefaults.has(app.name) && {
                    backgroundColor: (colors as any).appColor + "20",
                    borderColor: (colors as any).appColor,
                  },
                ]}
                onPress={() => toggleDefaultAppliance(app.name)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.defaultApplianceName,
                    selectedDefaults.has(app.name) && styles.defaultApplianceNameSelected,
                  ]}
                >
                  {app.name}
                </Text>
                <Text style={styles.defaultApplianceInfo}>
                  {app.power} kW • {app.duration}h
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
      <FloatingBottomBar />
    </SafeAreaView>
  );
}


const getThemedStyles = (colors: typeof Colors.light) => {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContainer: {
      flex: 1,
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    defaultAppliancesSection: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 16,
    },
    defaultAppliancesGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    defaultApplianceCard: {
      width: (Dimensions.get("window").width - 48) / 2, // 2 columns with padding
      padding: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.icon + "30",
      backgroundColor: (colors as any).cardBackground || colors.background,
    },
    defaultApplianceCardSelected: {
      borderWidth: 2,
    },
    defaultApplianceName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 4,
    },
    defaultApplianceNameSelected: {
      color: (colors as any).appColor,
    },
    defaultApplianceInfo: {
      fontSize: 12,
      color: colors.icon,
    },
  });
};
