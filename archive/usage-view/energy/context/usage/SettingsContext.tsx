import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Types
export interface Appliance {
  id: string;
  name: string;
  power: number; // in kW
  duration: number; // in hours
  timePreference: "day" | "night" | "no_preference";
  canRunInBannedHours: boolean;
  isActive: boolean;
  isDefault?: boolean;
}

export interface HouseSettings {
  title: string;
  bannedHours: { start: number; end: number }[];
  maxKW: number | null;
  scheduleHorizonHours?: number; // in hours, 30-min slots internally
  rescheduleFromNow?: boolean;   // flag to trigger reschedule action
}

interface SettingsContextType {
  appliances: Appliance[];
  houseSettings: HouseSettings;
  isLoaded: boolean;
  addAppliance: (appliance: Omit<Appliance, 'id'>) => void;
  updateAppliance: (id: string, updates: Partial<Appliance>) => void;
  deleteAppliance: (id: string) => void;
  updateHouseSettings: (settings: Partial<HouseSettings>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const STORAGE_KEYS = {
  APPLIANCES: '@energyApp_appliances',
  HOUSE_SETTINGS: '@energyApp_houseSettings',
};

export const MAX_APPLIANCES = 20;

const DEFAULT_HOUSE_SETTINGS: HouseSettings = {
  title: "House settings",
  bannedHours: [{ start: 22, end: 7 }], // 10 PM to 7 AM
  maxKW: 10,
  scheduleHorizonHours: 24,
  rescheduleFromNow: false,
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [houseSettings, setHouseSettings] = useState<HouseSettings>(DEFAULT_HOUSE_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [appliancesData, houseSettingsData] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.APPLIANCES),
        AsyncStorage.getItem(STORAGE_KEYS.HOUSE_SETTINGS),
      ]);

      if (appliancesData) {
        const parsedAppliances = JSON.parse(appliancesData);
        setAppliances(parsedAppliances);
      }

      if (houseSettingsData) {
        const parsedHouseSettings = JSON.parse(houseSettingsData);
        setHouseSettings(parsedHouseSettings);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveAppliances = async (newAppliances: Appliance[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.APPLIANCES, JSON.stringify(newAppliances));
    } catch (error) {
      console.error('Error saving appliances:', error);
    }
  };

  const saveHouseSettings = async (newSettings: HouseSettings) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.HOUSE_SETTINGS, JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving house settings:', error);
    }
  };

  const addAppliance = (appliance: Omit<Appliance, 'id'>) => {
    if (appliances.length >= MAX_APPLIANCES) {
      return; // enforce upper bound
    }
    const newAppliance: Appliance = {
      ...appliance,
      id: Date.now().toString(),
    };
    const newAppliances = [...appliances, newAppliance];
    setAppliances(newAppliances);
    saveAppliances(newAppliances);
  };

  const updateAppliance = (id: string, updates: Partial<Appliance>) => {
    const newAppliances = appliances.map(app =>
      app.id === id ? { ...app, ...updates } : app
    );
    setAppliances(newAppliances);
    saveAppliances(newAppliances);
  };

  const deleteAppliance = (id: string) => {
    const newAppliances = appliances.filter(app => app.id !== id);
    setAppliances(newAppliances);
    saveAppliances(newAppliances);
  };

  const updateHouseSettings = (updates: Partial<HouseSettings>) => {
    const newSettings = { ...houseSettings, ...updates };
    setHouseSettings(newSettings);
    saveHouseSettings(newSettings);
  };

  const value: SettingsContextType = {
    appliances,
    houseSettings,
    isLoaded,
    addAppliance,
    updateAppliance,
    deleteAppliance,
    updateHouseSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
