import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect, Line, Text as SvgText, G } from "react-native-svg";
import { useTheme } from "@/context/common/ThemeContext";
import { Colors } from "@/constants/Colors";
import type { Appliance } from "@/context/usage/SettingsContext";
import type { ScheduleResult, ScheduleAssignment } from "@/services/usage/SchedulerService";
import { SLOTS_PER_HOUR } from "@/services/usage/SchedulerService";
import type { HourlyPrice } from "@/domain/types";

interface TimeLineChartProps {
  priceData: HourlyPrice[];
  appliances: Appliance[];
  scheduleResult: ScheduleResult | null;
  width: number;
  height: number;
  showLegend?: boolean;
}

// Color palette for appliances
const APPLIANCE_COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#FFB6C1", "#87CEEB", "#F4A460",
  "#9370DB", "#3CB371", "#FFD700", "#FF69B4", "#00CED1",
  "#FF8C00", "#8FBC8F", "#DA70D6", "#F0E68C", "#6495ED",
];

export default function TimeLineChart({
  priceData,
  appliances,
  scheduleResult,
  width,
  height,
  showLegend = true,
}: TimeLineChartProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);
  
  const chartHeight = showLegend ? height * 0.6 : height; // Chart takes 60% of height if legend shown, 100% otherwise
  const legendHeight = showLegend ? height * 0.4 : 0; // Legend takes 40% if shown
  const padding = { top: 20, right: 15, bottom: 30, left: 45 };
  const chartWidth = width - padding.left - padding.right;
  const chartAreaHeight = chartHeight - padding.top - padding.bottom;
  
  // Determine number of hours represented by input data
  const isQuarterHourly = priceData.length >= 48; // heuristics: >= 48 implies sub-hour granularity
  const hoursCount = isQuarterHourly
    ? Math.max(1, Math.ceil(priceData.length / SLOTS_PER_HOUR))
    : Math.max(1, priceData.length);
  const pixelsPerHour = chartWidth / (hoursCount - 1);

  // Helper to compute scheduled appliances with stacking (shared by chart and legend)
  const computeScheduleLayout = (
    apps: Appliance[],
    result: ScheduleResult | null
  ) => {
    const scheduled: Array<{
      appliance: Appliance;
      startSlot: number;
      endSlot: number;
      color: string;
      yPosition: number;
    }> = [];

    const colorMap = new Map<string, string>();

    if (result && result.assignments.length > 0) {
      // Assign colors deterministically per appliance
      result.assignments.forEach((assignment) => {
        const app = apps.find((a) => a.id === assignment.applianceId);
        if (!app) return;
        if (!colorMap.has(app.id)) {
          colorMap.set(
            app.id,
            APPLIANCE_COLORS[colorMap.size % APPLIANCE_COLORS.length]
          );
        }
      });

      // Build scheduled appliances with stacking
      const occupiedSlots = new Map<number, number[]>();
      result.assignments.forEach((assignment) => {
        const app = apps.find((a) => a.id === assignment.applianceId);
        if (!app) return;
        const durationSlots = Math.ceil(app.duration * SLOTS_PER_HOUR);
        const endSlot = assignment.startSlot + durationSlots;

        // Find available y-position across the span
        let yPos = 0;
        for (let slot = assignment.startSlot; slot < endSlot; slot++) {
          const occupied = occupiedSlots.get(slot) || [];
          let testY = 0;
          while (occupied.includes(testY)) testY++;
          yPos = Math.max(yPos, testY);
        }

        // Mark slots as occupied
        for (let slot = assignment.startSlot; slot < endSlot; slot++) {
          const occupied = occupiedSlots.get(slot) || [];
          occupied.push(yPos);
          occupiedSlots.set(slot, occupied);
        }

        scheduled.push({
          appliance: app,
          startSlot: assignment.startSlot,
          endSlot,
          color: colorMap.get(app.id)!,
          yPosition: yPos,
        });
      });
    }

    return { scheduledAppliances: scheduled, applianceColors: colorMap };
  };

  // Calculate timeline bounds and schedule data
  const { scheduledAppliances, applianceColors } = useMemo(() => (
    computeScheduleLayout(appliances, scheduleResult)
  ), [scheduleResult, appliances]);

  const pixelsPerSlot = pixelsPerHour / SLOTS_PER_HOUR;
  
  // Max stack height
  const maxStack = Math.max(1, ...scheduledAppliances.map(s => s.yPosition + 1));
  const barHeight = Math.max(12, Math.min(20, chartAreaHeight / maxStack - 4)); // Make bars thicker

  // Generate hour labels at 3-hour intervals
  const hourLabels = [];
  for (let h = 0; h < hoursCount; h += 3) {
    const x = (h / (hoursCount - 1)) * chartWidth;
    hourLabels.push({ hour: h, x });
  }

  // Format time for display
  const formatTime = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };
  
  // Format slot time for legend (15‑minute slots)
  const formatSlotTime = (slot: number) => {
    const hour = Math.floor(slot / SLOTS_PER_HOUR);
    const minute = (slot % SLOTS_PER_HOUR) * (60 / SLOTS_PER_HOUR);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Chart */}
      <View style={{ height: chartHeight }}>
        <Svg width={width} height={chartHeight}>
          <G transform={`translate(${padding.left}, ${padding.top})`}>
            {/* Grid lines */}
            {hourLabels.map((label, idx) => (
              <Line
                key={`grid-${idx}`}
                x1={label.x}
                y1={0}
                x2={label.x}
                y2={chartAreaHeight}
                stroke={colors.icon + "20"}
                strokeWidth={1}
              />
            ))}
            
            {/* Scheduled appliances */}
            {scheduledAppliances.map((sched, idx) => {
              // Convert slots to hours and use StepChart's positioning approach
              const startHour = sched.startSlot / SLOTS_PER_HOUR;
              const endHour = sched.endSlot / SLOTS_PER_HOUR;
              const x = (startHour / (hoursCount - 1)) * chartWidth;
              const width = ((endHour - startHour) / (hoursCount - 1)) * chartWidth;
              const y = sched.yPosition * (barHeight + 4); // Increase spacing for thicker bars
              
              return (
                <G key={`app-${idx}`}>
                  <Rect
                    x={x}
                    y={y}
                    width={width}
                    height={barHeight}
                    fill={sched.color}
                    opacity={0.8}
                    rx={2}
                  />
                </G>
              );
            })}
            
            {/* X-axis labels */}
            {hourLabels.filter((_, i) => i % 2 === 0).map((label, idx) => (
              <SvgText
                key={`label-${idx}`}
                x={label.x}
                y={chartAreaHeight + 15}
                fontSize={10}
                fill={colors.icon}
                textAnchor="middle"
              >
                {formatTime(label.hour)}
              </SvgText>
            ))}
          </G>
        </Svg>
      </View>
      
      {/* Legend */}
      {showLegend && (
        <View style={[styles.legendContainer, { height: legendHeight }]}>
          <Text style={styles.legendTitle}>Scheduled Appliances</Text>
          {scheduledAppliances.length === 0 ? (
            <Text style={styles.noScheduleText}>No appliances scheduled</Text>
          ) : (
            scheduledAppliances.map((sched, idx) => (
              <View key={`legend-${idx}`} style={styles.legendItem}>
                <View style={[styles.colorBox, { backgroundColor: sched.color }]} />
                <View style={styles.legendTextContainer}>
                  <Text style={styles.legendName}>{sched.appliance.name}</Text>
                  <Text style={styles.legendTime}>
                    {formatSlotTime(sched.startSlot)} - {formatSlotTime(sched.endSlot)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const getThemedStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    legendContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    legendTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    noScheduleText: {
      fontSize: 12,
      color: colors.icon,
      fontStyle: "italic",
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 6,
    },
    colorBox: {
      width: 16,
      height: 16,
      borderRadius: 3,
      marginRight: 8,
    },
    legendTextContainer: {
      flex: 1,
    },
    legendName: {
      fontSize: 13,
      color: colors.text,
      fontWeight: "500",
    },
    legendTime: {
      fontSize: 11,
      color: colors.icon,
      marginTop: 1,
    },
  });

// Export legend component separately
interface LegendProps {
  appliances: Appliance[];
  scheduleResult: ScheduleResult | null;
  height?: number;
}

export function ScheduledAppliancesLegend({ appliances, scheduleResult, height = 120 }: LegendProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);

  // Calculate scheduled appliances using shared helper
  const { scheduledAppliances } = useMemo(() => (
    // Reuse the same logic as the chart to avoid divergence
    (function(apps: Appliance[], result: ScheduleResult | null) {
      const layout = (() => {
        // Inline copy to avoid exporting helpers; keeps file self-contained
        const scheduled: Array<{
          appliance: Appliance;
          startSlot: number;
          endSlot: number;
          color: string;
          yPosition: number;
        }> = [];
        const colorMap = new Map<string, string>();
        if (result && result.assignments.length > 0) {
          result.assignments.forEach((assignment) => {
            const app = apps.find((a) => a.id === assignment.applianceId);
            if (!app) return;
            if (!colorMap.has(app.id)) {
              colorMap.set(app.id, APPLIANCE_COLORS[colorMap.size % APPLIANCE_COLORS.length]);
            }
          });
          const occupiedSlots = new Map<number, number[]>();
          result.assignments.forEach((assignment) => {
            const app = apps.find((a) => a.id === assignment.applianceId);
            if (!app) return;
            const durationSlots = Math.ceil(app.duration * SLOTS_PER_HOUR);
            const endSlot = assignment.startSlot + durationSlots;
            let yPos = 0;
            for (let slot = assignment.startSlot; slot < endSlot; slot++) {
              const occupied = occupiedSlots.get(slot) || [];
              let testY = 0;
              while (occupied.includes(testY)) testY++;
              yPos = Math.max(yPos, testY);
            }
            for (let slot = assignment.startSlot; slot < endSlot; slot++) {
              const occupied = occupiedSlots.get(slot) || [];
              occupied.push(yPos);
              occupiedSlots.set(slot, occupied);
            }
            scheduled.push({
              appliance: app!,
              startSlot: assignment.startSlot,
              endSlot,
              color: colorMap.get(app!.id)!,
              yPosition: yPos,
            });
          });
        }
        return { scheduledAppliances: scheduled };
      })();
      return layout;
    })(appliances, scheduleResult)
  ), [scheduleResult, appliances]);

  // Format slot time for legend
  const formatSlotTime = (slot: number) => {
    const hour = Math.floor(slot / SLOTS_PER_HOUR);
    const minute = (slot % SLOTS_PER_HOUR) * (60 / SLOTS_PER_HOUR);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.legendContainer, { height }]}>
      <Text style={styles.legendTitle}>Scheduled Appliances</Text>
      {scheduledAppliances.length === 0 ? (
        <Text style={styles.noScheduleText}>No appliances scheduled</Text>
      ) : (
        scheduledAppliances.map((sched, idx) => (
          <View key={`legend-${idx}`} style={styles.legendItem}>
            <View style={[styles.colorBox, { backgroundColor: sched.color }]} />
            <View style={styles.legendTextContainer}>
              <Text style={styles.legendName}>{sched.appliance.name}</Text>
              <Text style={styles.legendTime}>
                {formatSlotTime(sched.startSlot)} - {formatSlotTime(sched.endSlot)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}
