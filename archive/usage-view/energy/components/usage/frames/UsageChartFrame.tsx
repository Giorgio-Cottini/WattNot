import React from "react";
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity, Modal, Pressable, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Frame from "@/components/common/frames/Frame";
import { useTheme } from "@/context/common/ThemeContext";
import { Colors } from "@/constants/Colors";
import TimeLineChart, { ScheduledAppliancesLegend } from "@/components/usage/charts/TimeLineChart";
import type { HourlyPrice } from "@/domain/types";
import type { ScheduleResult } from "@/services/usage/SchedulerService";
import type { Appliance } from "@/context/usage/SettingsContext";
import { getShadowStyle } from "@/utils/styles/shadow";

// Custom slider component for schedule horizon
interface CustomSliderProps {
  value: number;
  minimumValue: number;
  maximumValue: number;
  step: number;
  onValueChange: (value: number) => void;
  trackColor: string;
  thumbColor: string;
  activeTrackColor: string;
}

function CustomSlider({ 
  value, 
  minimumValue, 
  maximumValue, 
  step, 
  onValueChange, 
  trackColor, 
  thumbColor, 
  activeTrackColor 
}: CustomSliderProps) {
  const [sliderWidth, setSliderWidth] = React.useState<number>(200);

  const updateFromX = React.useCallback((x: number) => {
    const clampedX = Math.max(0, Math.min(sliderWidth, x));
    const pct = sliderWidth === 0 ? 0 : clampedX / sliderWidth;
    const range = maximumValue - minimumValue;
    const rawValue = minimumValue + pct * range;
    const steppedValue = Math.round(rawValue / step) * step;
    const clampedValue = Math.max(minimumValue, Math.min(maximumValue, steppedValue));
    onValueChange(clampedValue);
  }, [sliderWidth, minimumValue, maximumValue, step, onValueChange]);

  const handlePress = (event: any) => {
    updateFromX(event.nativeEvent.locationX);
  };

  const handleMove = (event: any) => {
    updateFromX(event.nativeEvent.locationX);
  };

  const percentage = (value - minimumValue) / (maximumValue - minimumValue);

  const sliderStyles = StyleSheet.create({
    sliderOuter: {
      height: 48,
      justifyContent: 'center',
    },
    sliderTrack: {
      height: 10,
      borderRadius: 5,
      position: 'relative',
      justifyContent: 'center',
    },
    sliderActiveTrack: {
      height: 10,
      borderRadius: 5,
      position: 'absolute',
      left: 0,
      top: 0,
    },
    sliderThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      position: 'absolute',
      top: -7,
      ...getShadowStyle({ color: '#000', offsetX: 0, offsetY: 2, radius: 3.84, opacity: 0.25, elevation: 5 }),
    },
  });

  return (
    <View 
      style={sliderStyles.sliderOuter}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(evt) => {
        evt.preventDefault();
        handlePress(evt);
        return true;
      }}
      onResponderMove={(evt) => {
        evt.preventDefault();
        handleMove(evt);
        return true;
      }}
    >
    <TouchableOpacity 
      style={[sliderStyles.sliderTrack, { backgroundColor: trackColor }]}
        onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
      onPress={handlePress}
      activeOpacity={1}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <View style={[sliderStyles.sliderActiveTrack, { 
        backgroundColor: activeTrackColor, 
          width: `${Math.max(0, Math.min(1, percentage)) * 100}%` 
      }]} />
      <View style={[sliderStyles.sliderThumb, { 
        backgroundColor: thumbColor,
          left: `${Math.max(0, Math.min(1, percentage)) * 100}%`,
          marginLeft: -12,
      }]} />
    </TouchableOpacity>
    </View>
  );
}

interface UsageChartFrameProps {
  priceData: HourlyPrice[];
  appliances: Appliance[];
  scheduleResult: ScheduleResult | null;
  scheduleHorizonHours: number;
  maxAvailableHours: number;
  style?: ViewStyle;
  onScheduleHorizonChange?: (hours: number) => void;
  onReschedule?: (selectedAppliances: string[], horizonHours: number) => void;
}

export default function UsageChartFrame({
  priceData,
  appliances,
  scheduleResult,
  scheduleHorizonHours,
  maxAvailableHours,
  style,
  onScheduleHorizonChange,
  onReschedule,
}: UsageChartFrameProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);
  const [chartWidth, setChartWidth] = React.useState<number>(0);
  const [legendHeight, setLegendHeight] = React.useState<number>(120);
  const [showRescheduleModal, setShowRescheduleModal] = React.useState(false);
  const [selectedAppliances, setSelectedAppliances] = React.useState<Set<string>>(new Set());
  const [modalHorizonHours, setModalHorizonHours] = React.useState(scheduleHorizonHours);

  if (!priceData || priceData.length === 0) {
    return (
      <Frame style={StyleSheet.flatten([styles.frameContainer, style])}>
        <Text style={[styles.noDataText, { color: colors.icon }]}>
          No price data available
        </Text>
      </Frame>
    );
  }

  // Initialize selected appliances with all active appliances
  React.useEffect(() => {
    const activeIds = new Set(appliances.filter(a => a.isActive).map(a => a.id));
    setSelectedAppliances(activeIds);
  }, [appliances]);

  // Update modal horizon when prop changes
  React.useEffect(() => {
    setModalHorizonHours(scheduleHorizonHours);
  }, [scheduleHorizonHours]);

  // Calculate dynamic legend height based on number of scheduled appliances
  React.useEffect(() => {
    if (scheduleResult && scheduleResult.assignments.length > 0) {
      // Base height + (number of assignments * item height) + padding
      const baseHeight = 60; // Title + padding
      const itemHeight = 40; // Each legend item height
      const calculatedHeight = baseHeight + (scheduleResult.assignments.length * itemHeight);
      setLegendHeight(Math.max(120, Math.min(300, calculatedHeight))); // Min 120, max 300
    } else {
      setLegendHeight(120); // Default height when no appliances
    }
  }, [scheduleResult]);

  const handleReschedule = () => {
    onReschedule?.(Array.from(selectedAppliances), modalHorizonHours);
    setShowRescheduleModal(false);
  };

  const toggleAppliance = (applianceId: string) => {
    const newSelected = new Set(selectedAppliances);
    if (newSelected.has(applianceId)) {
      newSelected.delete(applianceId);
    } else {
      newSelected.add(applianceId);
    }
    setSelectedAppliances(newSelected);
  };

  return (
    <>
      <Frame padding={0} style={StyleSheet.flatten([styles.frameContainer, style])}>
        {/* Header similar to ChartFrame */}
        <View style={styles.chartHeader}>
          <TouchableOpacity style={styles.chartButton} activeOpacity={0.7}>
            <Text style={styles.chartTitle}>Timeline Chart</Text>
            <Ionicons name="chevron-down-outline" size={16} color={colors.text} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.rescheduleButton} 
            onPress={() => setShowRescheduleModal(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={18} color={colors.text} />
            <Text style={styles.rescheduleText}>Re-schedule</Text>
          </TouchableOpacity>
        </View>

      {/* Chart section */}
      <View style={styles.chartContainer} onLayout={(e) => {
        const w = e?.nativeEvent?.layout?.width ?? 0;
        if (w && Math.abs(w - chartWidth) > 1) setChartWidth(w);
      }}>
        <TimeLineChart
          priceData={priceData}
          appliances={appliances}
          scheduleResult={scheduleResult}
          width={chartWidth > 0 ? chartWidth : 340}
          height={180}
          showLegend={false}
        />
      </View>
      
        {/* Scheduled Appliances Legend with dynamic height */}
        <View style={styles.legendSectionContainer}>
          <ScheduledAppliancesLegend
            appliances={appliances}
            scheduleResult={scheduleResult}
            height={legendHeight}
          />
        </View>
      </Frame>

      {/* Re-schedule Modal */}
      <Modal
        visible={showRescheduleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRescheduleModal(false)}
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Re-schedule Appliances</Text>
              <TouchableOpacity onPress={() => setShowRescheduleModal(false)}>
                <Ionicons name="close-outline" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.modalContent}
              contentContainerStyle={styles.modalContentContainer}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Schedule Horizon Slider */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Schedule Horizon: {modalHorizonHours} hours</Text>
        <View style={styles.sliderRow}>
                  <Text style={styles.sliderMinLabel}>1h</Text>
          <View style={styles.customSliderContainer}>
            <CustomSlider
                      value={modalHorizonHours}
                      minimumValue={1}
              maximumValue={maxAvailableHours}
              step={1}
                      onValueChange={setModalHorizonHours}
              trackColor={colors.icon + '30'}
              thumbColor={colors.tint}
              activeTrackColor={colors.tint}
            />
          </View>
          <Text style={styles.sliderMaxLabel}>{maxAvailableHours}h</Text>
        </View>
      </View>
      
              {/* Appliances Selection */}
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Select Appliances to Schedule</Text>
                {appliances.filter(a => a.isActive).length === 0 ? (
                  <Text style={styles.noAppliancesText}>No active appliances available</Text>
                ) : (
                  appliances.filter(a => a.isActive).map((appliance) => (
                    <View key={appliance.id} style={styles.applianceItem}>
                      <View style={styles.applianceInfo}>
                        <Text style={styles.applianceName}>{appliance.name}</Text>
                        <Text style={styles.applianceDetails}>
                          {appliance.power} kW • {appliance.duration}h
                        </Text>
                      </View>
                      <Switch
                        value={selectedAppliances.has(appliance.id)}
                        onValueChange={() => toggleAppliance(appliance.id)}
                        trackColor={{ false: colors.icon + '30', true: colors.tint + '50' }}
                        thumbColor={selectedAppliances.has(appliance.id) ? colors.tint : colors.icon}
                      />
                    </View>
                  ))
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowRescheduleModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.rescheduleActionButton]}
                onPress={handleReschedule}
              >
                <Text style={styles.rescheduleActionButtonText}>Re-schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const getThemedStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    frameContainer: {
      marginBottom: 16,
    },
    chartHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon + '20',
    },
    chartButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.icon + '30',
      borderRadius: 8,
      backgroundColor: 'transparent',
      minWidth: 140,
    },
    chartTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    rescheduleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.icon + '30',
      borderRadius: 8,
      backgroundColor: 'transparent',
      gap: 6,
    },
    rescheduleText: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    noDataText: {
      fontSize: 14,
      textAlign: "center",
      padding: 20,
    },
    chartContainer: {
      marginHorizontal: 0,
      marginBottom: 8,
      paddingHorizontal: 16,
    },
    sliderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sliderMinLabel: {
      fontSize: 12,
      color: colors.icon,
      minWidth: 24,
      textAlign: 'center',
    },
    sliderMaxLabel: {
      fontSize: 12,
      color: colors.icon,
      minWidth: 24,
      textAlign: 'center',
    },
    customSliderContainer: {
      flex: 1,
      height: 48,
      justifyContent: 'center',
    },
    legendSectionContainer: {
      marginHorizontal: 0,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
      minHeight: '50%',
      flex: 0,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon + '20',
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    modalContent: {
      flex: 1,
    },
    modalContentContainer: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    modalSection: {
      marginVertical: 16,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    applianceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.icon + '10',
    },
    applianceInfo: {
      flex: 1,
    },
    applianceName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    applianceDetails: {
      fontSize: 14,
      color: colors.icon,
      marginTop: 2,
    },
    modalActions: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.icon + '20',
    },
    modalButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.icon + '20',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    rescheduleActionButton: {
      backgroundColor: colors.tint,
    },
    rescheduleActionButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    noAppliancesText: {
      fontSize: 14,
      color: colors.icon,
      fontStyle: 'italic',
      textAlign: 'center',
      paddingVertical: 20,
    },
  });
