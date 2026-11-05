import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
  TextInput,
  Switch,
  Animated,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import FrameColouredTop from "@/components/common/frames/FrameColouredTop";
import { useTheme } from "@/context/common/ThemeContext";
import { Colors } from "@/constants/Colors";
import type { Appliance } from "@/context/usage/SettingsContext";

// Normalize a decimal input string by converting commas to periods and
// constraining to at most two decimal digits. Removes invalid characters.
// Preserves a trailing decimal separator so users see immediate feedback after typing it.
function normalizeDecimalInput(input: string): string {
  if (!input) return "";
  const s = input.replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot === -1) return s; // integers only
  const intPart = s.slice(0, firstDot) || "";
  const rest = s.slice(firstDot + 1).replace(/\./g, ""); // drop extra dots
  // Preserve trailing dot when user just typed it
  if (s.endsWith(".") && rest.length === 0) return `${intPart}.`;
  const decPart = rest.slice(0, 2);
  return decPart.length ? `${intPart}.${decPart}` : intPart;
}

// Snap a numeric hour value to the nearest 15 minutes (0.25h)
function snapToQuarterHour(hours: number): number {
  if (!isFinite(hours as any)) return hours;
  const snapped = Math.round(hours / 0.25) * 0.25;
  // Avoid -0 and enforce lower bound > 0 when used
  return Math.abs(snapped) === 0 ? 0 : +snapped.toFixed(2);
}

// Helper functions from HouseSettingsFrame
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
function formatRanges(ranges: { start: number; end: number }[]): string {
  if (!ranges.length) return '—';
  return ranges.map(r => `${pad2(r.start)}:00-${pad2(r.end)}:00`).join(', ');
}
function hoursFromRanges(ranges: { start: number; end: number }[]): Set<number> {
  const set = new Set<number>();
  for (const { start, end } of ranges) {
    let h = start % 24;
    while (h !== end % 24) {
      set.add(h);
      h = (h + 1) % 24;
      if (set.size > 24) break;
    }
  }
  return set;
}
function rangesFromHours(hours: Set<number>): { start: number; end: number }[] {
  if (hours.size === 0) return [];
  const sorted = Array.from(hours).sort((a, b) => a - b);
  const ranges: { start: number; end: number }[] = [];
  
  let start = sorted[0];
  let prev = sorted[0];
  
  for (let i = 1; i < sorted.length; i++) {
    const h = sorted[i];
    if (h === (prev + 1) % 24) {
      prev = h;
      continue;
    }
    ranges.push({ start, end: (prev + 1) % 24 });
    start = h;
    prev = h;
  }
  ranges.push({ start, end: (prev + 1) % 24 });
  
  if (ranges.length > 1) {
    const merged: { start: number; end: number }[] = [];
    const first = ranges[0];
    const last = ranges[ranges.length - 1];
    
    if (last.end === first.start) {
      merged.push({ start: last.start, end: first.end });
      for (let i = 1; i < ranges.length - 1; i++) {
        merged.push(ranges[i]);
      }
      return merged;
    }
  }
  
  return ranges;
}
function clampKW(input: string): number {
  const n = parseInt(input || '0', 10);
  if (isNaN(n)) return 5;
  return Math.max(5, Math.min(999, n));
}


interface AppliancesFrameProps {
  title: string;
  bannedHours: { start: number; end: number }[];
  maxKW: number | null;
  appliances: Appliance[];
  maxAppliances: number;
  style?: ViewStyle;
  onSettingsChange: (updates: { title?: string; bannedHours?: { start: number; end: number }[]; maxKW?: number | null }) => void;
  onAddAppliance: (appliance: Omit<Appliance, "id" | "isActive">) => void;
  onUpdateAppliance: (id: string, updates: Partial<Appliance>) => void;
  onDeleteAppliance: (id: string) => void;
  onToggleActivation: (id: string) => void;
}

export default function AppliancesFrame({
  title,
  bannedHours,
  maxKW,
  appliances,
  maxAppliances,
  style,
  onSettingsChange,
  onAddAppliance,
  onUpdateAppliance,
  onDeleteAppliance,
  onToggleActivation,
}: AppliancesFrameProps) {
  const { colors } = useTheme();
  const styles = getThemedStyles(colors);

  // State from HouseSettings
  const [isEditingSettings, setIsEditingSettings] = React.useState(false);
  const [localTitle, setLocalTitle] = React.useState(title);
  const [selectedHours, setSelectedHours] = React.useState<Set<number>>(() => hoursFromRanges(bannedHours));
  const [noLimit, setNoLimit] = React.useState<boolean>(maxKW === null);
  const [localMaxKW, setLocalMaxKW] = React.useState<string>(maxKW === null ? "" : String(maxKW));

  // Local UI state for appliances
  const [addApplianceExpanded, setAddApplianceExpanded] = useState(false);
  const [expandedAppliances, setExpandedAppliances] = useState<Set<string>>(new Set());

  // Form state for adding appliances
  const [formData, setFormData] = useState<Omit<Appliance, "id" | "isActive">>({
    name: "", power: 1, duration: 1, timePreference: "no_preference", canRunInBannedHours: false,
  });
  const [formPowerText, setFormPowerText] = useState<string>("1");
  const [formDurationText, setFormDurationText] = useState<string>("1");
  
  // Animation values
  const addApplianceHeight = useRef(new Animated.Value(0)).current;
  const plusRotation = useRef(new Animated.Value(0)).current;

  // Effects from HouseSettings
  React.useEffect(() => { setLocalTitle(title); }, [title]);
  React.useEffect(() => { setSelectedHours(hoursFromRanges(bannedHours)); }, [bannedHours]);
  React.useEffect(() => {
    setNoLimit(maxKW === null);
    setLocalMaxKW(maxKW === null ? "" : String(maxKW));
  }, [maxKW]);

  // Handlers from HouseSettings
  const toggleHour = (h: number) => {
    setSelectedHours(prev => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h); else next.add(h);
      return next;
    });
  };
  const handleSaveSettings = () => {
    const nextTitle = localTitle.trim().slice(0, 20);
    const nextMax = noLimit ? null : clampKW(localMaxKW);
    const nextRanges = rangesFromHours(selectedHours);
    onSettingsChange?.({ 
      title: nextTitle.length ? nextTitle : title, 
      bannedHours: nextRanges, 
      maxKW: nextMax 
    });
    setIsEditingSettings(false);
  };
  const handleCancelSettings = () => {
    setIsEditingSettings(false);
    setLocalTitle(title);
    setSelectedHours(hoursFromRanges(bannedHours));
    setNoLimit(maxKW === null);
    setLocalMaxKW(maxKW === null ? "" : String(maxKW));
  };
  
  // (Appliance handlers: toggleAddAppliance, handleAddAppliance, etc. remain unchanged)
  const toggleAddAppliance = () => {
    const toValue = addApplianceExpanded ? 0 : 1;
    setAddApplianceExpanded(!addApplianceExpanded);
    
    Animated.parallel([
      Animated.spring(addApplianceHeight, { toValue, useNativeDriver: false, }),
      Animated.timing(plusRotation, { toValue, duration: 300, useNativeDriver: true, }),
    ]).start();
  };

  const handleAddAppliance = () => {
    if (appliances.length >= maxAppliances) {
      alert(`You can add up to ${maxAppliances} appliances.`);
      return;
    }
    if (!formData.name || formData.power <= 0 || formData.duration <= 0) return;

    onAddAppliance(formData);
    setFormData({ name: "", power: 1, duration: 1, timePreference: "no_preference", canRunInBannedHours: false });
    setFormPowerText("1");
    setFormDurationText("1");
    toggleAddAppliance();
  };

  const toggleApplianceExpansion = (id: string) => {
    setExpandedAppliances(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const rotateInterpolate = plusRotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"], });

  return (
    <FrameColouredTop
      currentPrice={null}
      style={StyleSheet.flatten([styles.frameContainer, style])}
      topContent={(
        <View style={styles.headerOnTop}>
          <Text style={styles.headerOnTopTitle}>{title}</Text>
          <TouchableOpacity
            onPress={() => {
              if (isEditingSettings) { handleCancelSettings(); } 
              else { setIsEditingSettings(true); }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    >
      {/* Read-only summary */}
      <View style={styles.summaryRow}>
        <Ionicons name="time-outline" size={18} color={colors.icon} />
        <Text style={styles.summaryLabel}>Banned hours:</Text>
        <Text style={styles.summaryValue}>{formatRanges(bannedHours)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Ionicons name="flash-outline" size={18} color={colors.icon} />
        <Text style={styles.summaryLabel}>Max kW:</Text>
        <Text style={styles.summaryValue}>{maxKW === null ? "No limit" : `${maxKW} kW`}</Text>
      </View>

      {/* Editing controls */}
      {isEditingSettings && (
        <View style={styles.editContainer}>
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Title</Text>
            <TextInput
              style={styles.titleInput}
              value={localTitle}
              onChangeText={(t) => setLocalTitle(t.slice(0, 20))}
              placeholder="House settings"
              maxLength={20}
              placeholderTextColor={colors.icon}
            />
          </View>
          <Text style={styles.editSectionTitle}>Banned hours</Text>
          <View style={styles.hoursGrid}>
            {Array.from({ length: 24 }).map((_, h) => {
              const next = (h + 1) % 24;
              const label = `${pad2(h)}:00-${pad2(next)}:00`;
              const active = selectedHours.has(h);
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourChip, active && styles.hourChipActive]}
                  onPress={() => toggleHour(h)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.hourChipText, active && styles.hourChipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.editSectionTitle}>Max kW</Text>
          <View style={styles.kwRow}>
            <TextInput
              style={[styles.kwInput, noLimit && { opacity: 0.5 }]}
              value={localMaxKW}
              onChangeText={(t) => setLocalMaxKW(t.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              editable={!noLimit}
              placeholder="10"
              placeholderTextColor={colors.icon}
            />
            <View style={styles.noLimitRow}>
              <Switch
                value={noLimit}
                onValueChange={(v) => setNoLimit(v)}
                trackColor={{ false: colors.icon, true: colors.tint }}
                thumbColor={Platform.OS === "ios" ? "#FFFFFF" : colors.background}
              />
              <Text style={styles.noLimitText}>No limit</Text>
            </View>
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelSettings}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* APPLIANCE SECTION */}
      <View style={styles.separator} />
      <Text style={styles.appliancesTitle}>Appliances ({appliances.length})</Text>
      
      <View style={styles.appliancesList}>
        {appliances.length === 0 ? (
          <Text style={styles.emptyAppliancesText}>Add your first appliance below</Text>
        ) : (
          appliances.map((appliance) => (
            <ApplianceCard
              key={appliance.id}
              appliance={appliance}
              isExpanded={expandedAppliances.has(appliance.id)}
              onPress={() => onToggleActivation(appliance.id)}
              onEdit={() => toggleApplianceExpansion(appliance.id)}
              onUpdate={(updates) => onUpdateAppliance(appliance.id, updates)}
              onDelete={() => {
                onDeleteAppliance(appliance.id);
                setExpandedAppliances(prev => {
                  const next = new Set(prev);
                  next.delete(appliance.id);
                  return next;
                });
              }}
              colors={colors}
              styles={styles}
            />
          ))
        )}
      </View>
      
      <View style={styles.separator} />
      
      <TouchableOpacity onPress={toggleAddAppliance} activeOpacity={0.7}>
        <View style={styles.addApplianceHeader}>
          <Text style={styles.addApplianceTitle}>Add Appliance</Text>
          <Animated.View style={{ transform: [{ rotate: rotateInterpolate }] }}>
            <Ionicons name="add-circle-outline" size={28} color={addApplianceExpanded ? (colors as any).appColor : colors.icon} />
          </Animated.View>
        </View>
      </TouchableOpacity>

      <Animated.View style={[ styles.expandableContent, { maxHeight: addApplianceHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 400], }), opacity: addApplianceHeight, }, ]} >
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Name:</Text>
          <TextInput
            style={styles.textInput}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            placeholder="Appliance name"
            placeholderTextColor={colors.icon}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Power (kW):</Text>
          <TextInput
            style={styles.numberInput}
            value={formPowerText}
            onChangeText={(text) => {
              const normalized = normalizeDecimalInput(text);
              setFormPowerText(normalized);
              const asNumber = normalized.endsWith(".") ? NaN : parseFloat(normalized);
              setFormData({ ...formData, power: isNaN(asNumber) ? formData.power : asNumber });
            }}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            placeholder="1.0"
            placeholderTextColor={colors.icon}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Duration (hours):</Text>
          <TextInput
            style={styles.numberInput}
            value={formDurationText}
            onChangeText={(text) => {
              const normalized = normalizeDecimalInput(text);
              setFormDurationText(normalized);
              const asNumber = normalized.endsWith(".") ? NaN : parseFloat(normalized);
              setFormData({ ...formData, duration: isNaN(asNumber) ? formData.duration : asNumber });
            }}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            placeholder="1.0"
            placeholderTextColor={colors.icon}
            onEndEditing={() => {
              const current = parseFloat(formDurationText);
              if (!isNaN(current)) {
                const snapped = snapToQuarterHour(current);
                const text = snapped.toString();
                setFormDurationText(text);
                setFormData({ ...formData, duration: Math.max(0.25, snapped) });
              }
            }}
          />
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Time Preference:</Text>
          <View style={styles.ternaryChoice}>
            {(["day", "night", "no_preference"] as const).map((pref) => (
              <TouchableOpacity
                key={pref}
                style={[ styles.choiceButton, formData.timePreference === pref && styles.choiceButtonActive, ]}
                onPress={() => setFormData({ ...formData, timePreference: pref })}
              >
                <Text style={[ styles.choiceText, formData.timePreference === pref && styles.choiceTextActive, ]} >
                  {pref === "no_preference" ? "None" : pref.charAt(0).toUpperCase() + pref.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.formRow}>
          <Text style={styles.formLabel}>Can run in banned hours:</Text>
          <Switch
            value={formData.canRunInBannedHours}
            onValueChange={(value) => setFormData({ ...formData, canRunInBannedHours: value })}
            trackColor={{ false: colors.icon, true: (colors as any).appColor }}
            thumbColor={Platform.OS === "ios" ? "#FFFFFF" : colors.background}
          />
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={toggleAddAppliance} >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.addButton]} onPress={handleAddAppliance} >
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </FrameColouredTop>
  );
}

// Appliance Card Component
interface ApplianceCardProps {
  appliance: Appliance;
  isExpanded: boolean;
  onPress: () => void;
  onEdit: () => void;
  onUpdate: (updates: Partial<Appliance>) => void;
  onDelete: () => void;
  colors: typeof Colors.light;
  styles: any;
}

const ApplianceCard: React.FC<ApplianceCardProps> = ({
  appliance,
  isExpanded,
  onPress,
  onEdit,
  onUpdate,
  onDelete,
  colors,
  styles,
}) => {
  const [editData, setEditData] = useState({
    power: appliance.power,
    duration: appliance.duration,
    timePreference: appliance.timePreference,
    canRunInBannedHours: appliance.canRunInBannedHours,
  });
  const [editPowerText, setEditPowerText] = useState<string>(appliance.power.toString());
  const [editDurationText, setEditDurationText] = useState<string>(appliance.duration.toString());

  const expandHeight = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.spring(expandHeight, {
      toValue: isExpanded ? 1 : 0,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  const handleSave = () => {
    onUpdate(editData);
    onEdit(); // Close expansion
  };

  return (
    <View style={[styles.applianceCard, appliance.isActive && styles.applianceCardActive]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <View style={styles.applianceCardHeader}>
          <View style={styles.applianceCardLeft}>
            <View>
              <Text style={[styles.applianceName, !appliance.isActive && styles.applianceNameInactive]}>
                {appliance.name}
              </Text>
              <Text style={styles.applianceInfo}>
                {appliance.power} kW • {appliance.duration}h
                {appliance.timePreference !== "no_preference" ? ` • ${appliance.timePreference}` : ""}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="pencil" size={18} color={colors.icon} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      <Animated.View
        style={[
          styles.applianceExpandedContent,
          {
            maxHeight: expandHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 300],
            }),
            opacity: expandHeight,
          },
        ]}
      >
        {/* Edit Form */}
        <View style={styles.editForm}>
          {/* Power */}
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Power (kW):</Text>
            <TextInput
              style={styles.editInput}
              value={editPowerText}
              onChangeText={(text) => {
                const normalized = normalizeDecimalInput(text);
                setEditPowerText(normalized);
                const asNumber = normalized.endsWith(".") ? NaN : parseFloat(normalized);
                setEditData({ ...editData, power: isNaN(asNumber) ? editData.power : asNumber });
              }}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            />
          </View>

          {/* Duration */}
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Duration (h):</Text>
            <TextInput
              style={styles.editInput}
              value={editDurationText}
              onChangeText={(text) => {
                const normalized = normalizeDecimalInput(text);
                setEditDurationText(normalized);
                const asNumber = normalized.endsWith(".") ? NaN : parseFloat(normalized);
                setEditData({ ...editData, duration: isNaN(asNumber) ? editData.duration : asNumber });
              }}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              onEndEditing={() => {
                const current = parseFloat(editDurationText);
                if (!isNaN(current)) {
                  const snapped = snapToQuarterHour(current);
                  const text = snapped.toString();
                  setEditDurationText(text);
                  setEditData({ ...editData, duration: Math.max(0.25, snapped) });
                }
              }}
            />
          </View>

          {/* Time Preference */}
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Time:</Text>
            <View style={styles.ternaryChoiceSmall}>
              {(["day", "night", "no_preference"] as const).map((pref) => (
                <TouchableOpacity
                  key={pref}
                  style={[
                    styles.choiceButtonSmall,
                    editData.timePreference === pref && styles.choiceButtonActive,
                  ]}
                  onPress={() => setEditData({ ...editData, timePreference: pref })}
                >
                  <Text
                    style={[
                      styles.choiceTextSmall,
                      editData.timePreference === pref && styles.choiceTextActive,
                    ]}
                  >
                    {pref === "no_preference" ? "None" : pref === "day" ? "Day" : "Night"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Banned Hours Toggle */}
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Allow banned:</Text>
            <Switch
              value={editData.canRunInBannedHours}
              onValueChange={(value) => setEditData({ ...editData, canRunInBannedHours: value })}
              trackColor={{ false: colors.icon, true: (colors as any).appColor }}
              thumbColor={Platform.OS === "ios" ? "#FFFFFF" : colors.background}
            />
          </View>

          {/* Actions */}
          <View style={styles.editActions}>
            <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
              <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const getThemedStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    frameContainer: {
      marginBottom: 16,
    },
    headerOnTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerOnTopTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: '#FFFFFF',
      flex: 1,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    summaryLabel: {
      marginLeft: 6,
      color: colors.icon,
      fontSize: 14,
    },
    summaryValue: {
      marginLeft: 6,
      color: colors.text,
      fontWeight: '600',
      fontSize: 14,
      flexShrink: 1,
    },
    editContainer: {
      marginTop: 16,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.icon + "20",
    },
    editRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    editLabel: {
      fontSize: 14,
      color: colors.text,
      marginRight: 12,
      flex: 1,
    },
    titleInput: {
      flex: 2,
      borderWidth: 1,
      borderColor: colors.icon + '30',
      borderRadius: 8,
      padding: 8,
      color: colors.text,
      fontSize: 14,
      backgroundColor: (colors as any).cardBackground || colors.background,
    },
    editSectionTitle: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 8,
      marginTop: 8,
      fontWeight: '600',
    },
    hoursGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    hourChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.icon + '30',
      backgroundColor: (colors as any).cardBackground || colors.background,
    },
    hourChipActive: {
      borderColor: '#FF3B30',
      backgroundColor: '#FF3B30' + '20',
    },
    hourChipText: {
      color: colors.text,
      fontSize: 12,
    },
    hourChipTextActive: {
      color: colors.text,
      fontWeight: '600',
    },
    kwRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    kwInput: {
      width: 100,
      borderWidth: 1,
      borderColor: colors.icon + '30',
      borderRadius: 8,
      padding: 8,
      fontSize: 14,
      color: colors.text,
      textAlign: 'center',
      backgroundColor: (colors as any).cardBackground || colors.background,
    },
    noLimitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noLimitText: {
      color: colors.text,
      fontSize: 14,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.icon + '20',
      alignItems: 'center',
    },
    cancelBtnText: {
      color: colors.text,
      fontSize: 14,
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.tint,
      alignItems: 'center',
    },
    saveBtnText: {
      color: colors.background,
      fontSize: 14,
      fontWeight: '600',
    },
    appliancesTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      paddingHorizontal: 12,
    },
    separator: {
      height: 1,
      backgroundColor: colors.icon + "20",
      marginVertical: 16,
    },
    appliancesList: {},
    emptyAppliancesText: {
      textAlign: 'center',
      color: colors.icon,
      fontSize: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    addApplianceHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 16,
      marginBottom: 8,
      paddingHorizontal: 12,
    },
    addApplianceTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
    },
    expandableContent: {
      overflow: "hidden",
    },
    formRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 16,
      paddingHorizontal: 12,
    },
    formLabel: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    textInput: {
      flex: 1.5,
      borderWidth: 1,
      borderColor: colors.icon + "30",
      borderRadius: 8,
      padding: 8,
      fontSize: 14,
      color: colors.text,
    },
    numberInput: {
      width: 80,
      borderWidth: 1,
      borderColor: colors.icon + "30",
      borderRadius: 8,
      padding: 8,
      fontSize: 14,
      textAlign: "center",
      color: colors.text,
    },
    ternaryChoice: {
      flexDirection: "row",
      gap: 8,
    },
    ternaryChoiceSmall: {
      flexDirection: "row",
      gap: 4,
    },
    choiceButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.icon + "30",
      backgroundColor: colors.background,
    },
    choiceButtonSmall: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.icon + "30",
      backgroundColor: colors.background,
    },
    choiceButtonActive: {
      backgroundColor: (colors as any).appColor,
      borderColor: (colors as any).appColor,
    },
    choiceText: {
      fontSize: 14,
      color: colors.text,
    },
    choiceTextSmall: {
      fontSize: 12,
      color: colors.text,
    },
    choiceTextActive: {
      color: colors.background,
    },
    actionButtons: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 20,
      gap: 12,
      paddingHorizontal: 12,
    },
    actionButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center",
    },
    cancelButton: {
      backgroundColor: colors.icon + "20",
    },
    cancelButtonText: {
      color: colors.text,
      fontSize: 16,
    },
    addButton: {
      backgroundColor: (colors as any).appColor,
    },
    addButtonText: {
      color: colors.background,
      fontSize: 16,
      fontWeight: "600",
    },
    applianceCard: {
      backgroundColor: (colors as any).cardBackground || colors.background,
      borderRadius: 12,
      marginTop: 12,
      borderWidth: 1,
      borderColor: colors.icon + "20",
      overflow: "hidden",
    },
    applianceCardActive: {
      borderColor: (colors as any).appColor,
      backgroundColor: (colors as any).appColor + "20",
    },
    applianceCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 12,
    },
    applianceCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    applianceName: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    applianceNameInactive: {
      color: colors.icon,
    },
    applianceInfo: {
      fontSize: 12,
      color: colors.icon,
      marginTop: 2,
    },
    applianceExpandedContent: {
      overflow: "hidden",
    },
    editForm: {
      padding: 12,
      paddingTop: 0,
    },
    editActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 16,
      gap: 12,
    },
    deleteButton: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: "#FF3B30" + "20",
      gap: 6,
    },
    deleteButtonText: {
      color: "#FF3B30",
      fontSize: 14,
      fontWeight: "500",
    },
    saveButton: {
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 6,
      backgroundColor: (colors as any).appColor,
    },
    saveButtonText: {
      color: colors.background,
      fontSize: 14,
      fontWeight: "600",
    },
  });
