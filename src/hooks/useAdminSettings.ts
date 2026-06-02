"use client";

import { useState, useEffect } from "react";
import {
  CompanyFeatures,
  FirmFeatures,
  GovernmentSectorFeatures,
  NgoSectorFeatures,
  MicroSectorFeatures,
  SectorProfilesState,
  PlatformFeatureFlags,
  DEFAULT_FEATURES,
  DEFAULT_FIRM_FEATURES,
  DEFAULT_SECTOR_PROFILES,
  DEFAULT_PLATFORM_FLAGS,
  MOCK_CURRENT_COMPANY_ID,
  MOCK_CURRENT_FIRM_ID,
  MOCK_CURRENT_GOVERNMENT_ID,
  MOCK_CURRENT_NGO_ID,
  MOCK_CURRENT_MICRO_ID,
  StoredCompanyFeatures,
  StoredFirmFeatures,
  StoredGovernmentFeatures,
  StoredNgoFeatures,
  StoredMicroFeatures,
  normalizeCompanyFeatures,
  readStoredCompanyFeatures,
  normalizeFirmFeatures,
  readStoredFirmFeatures,
  normalizeSectorProfiles,
  readStoredSectorProfiles,
  buildDefaultFirmFeatures,
  buildDefaultGovernmentFeatures,
  buildDefaultNgoFeatures,
  buildDefaultMicroFeatures,
} from "./useAdminSettingsHelper";

export function useAdminSettings() {
  const [features, setFeatures] = useState<Record<string, CompanyFeatures>>({});
  const [firmFeatures, setFirmFeatures] = useState<Record<string, FirmFeatures>>({});
  const [sectorProfiles, setSectorProfiles] = useState<SectorProfilesState>(DEFAULT_SECTOR_PROFILES);
  const [platformFlags, setPlatformFlags] = useState<PlatformFeatureFlags>(DEFAULT_PLATFORM_FLAGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const normalizedFeatures = readStoredCompanyFeatures();
    const normalizedFirmFeatures = readStoredFirmFeatures();
    const normalizedSectorProfiles = readStoredSectorProfiles();
    setFeatures(normalizedFeatures);
    setFirmFeatures(normalizedFirmFeatures);
    setSectorProfiles(normalizedSectorProfiles);
    localStorage.setItem("nzamy_admin_features", JSON.stringify(normalizedFeatures));
    localStorage.setItem("nzamy_admin_firm_features", JSON.stringify(normalizedFirmFeatures));
    localStorage.setItem("nzamy_admin_sector_profiles", JSON.stringify(normalizedSectorProfiles));

    const storedPlatformFlags = localStorage.getItem("nzamy_platform_features");
    if (storedPlatformFlags) {
      setPlatformFlags(JSON.parse(storedPlatformFlags));
    } else {
      setPlatformFlags(DEFAULT_PLATFORM_FLAGS);
      localStorage.setItem("nzamy_platform_features", JSON.stringify(DEFAULT_PLATFORM_FLAGS));
    }
    
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nzamy_admin_features" && e.newValue) {
        setFeatures(normalizeCompanyFeatures(JSON.parse(e.newValue) as Record<string, StoredCompanyFeatures>));
      }
      if (e.key === "nzamy_admin_firm_features" && e.newValue) {
        setFirmFeatures(normalizeFirmFeatures(JSON.parse(e.newValue) as Record<string, StoredFirmFeatures>));
      }
      if (e.key === "nzamy_admin_sector_profiles" && e.newValue) {
        setSectorProfiles(normalizeSectorProfiles(JSON.parse(e.newValue) as Partial<{
          government: Record<string, StoredGovernmentFeatures>;
          ngo: Record<string, StoredNgoFeatures>;
          micro: Record<string, StoredMicroFeatures>;
        }>));
      }
      if (e.key === "nzamy_platform_features" && e.newValue) {
        setPlatformFlags(JSON.parse(e.newValue));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateCompanyFeatures = (companyId: string, updates: Partial<CompanyFeatures>) => {
    setFeatures(prev => {
      const next = { ...prev };
      next[companyId] = { ...next[companyId], ...updates };
      localStorage.setItem("nzamy_admin_features", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  const updateFirmFeatures = (firmId: string, updates: Partial<FirmFeatures>) => {
    setFirmFeatures(prev => {
      const next = { ...prev };
      next[firmId] = { ...(next[firmId] ?? buildDefaultFirmFeatures(firmId)), ...updates, firmId };
      localStorage.setItem("nzamy_admin_firm_features", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  const updateGovernmentProfile = (governmentId: string, updates: Partial<GovernmentSectorFeatures>) => {
    setSectorProfiles(prev => {
      const next: SectorProfilesState = {
        ...prev,
        government: {
          ...prev.government,
          [governmentId]: {
            ...(prev.government[governmentId] ?? buildDefaultGovernmentFeatures(governmentId)),
            ...updates,
            governmentId,
          },
        },
      };
      localStorage.setItem("nzamy_admin_sector_profiles", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  const updateNgoProfile = (ngoId: string, updates: Partial<NgoSectorFeatures>) => {
    setSectorProfiles(prev => {
      const next: SectorProfilesState = {
        ...prev,
        ngo: {
          ...prev.ngo,
          [ngoId]: {
            ...(prev.ngo[ngoId] ?? buildDefaultNgoFeatures(ngoId)),
            ...updates,
            ngoId,
          },
        },
      };
      localStorage.setItem("nzamy_admin_sector_profiles", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  const updateMicroProfile = (microId: string, updates: Partial<MicroSectorFeatures>) => {
    setSectorProfiles(prev => {
      const next: SectorProfilesState = {
        ...prev,
        micro: {
          ...prev.micro,
          [microId]: {
            ...(prev.micro[microId] ?? buildDefaultMicroFeatures(microId)),
            ...updates,
            microId,
          },
        },
      };
      localStorage.setItem("nzamy_admin_sector_profiles", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  const updatePlatformFeatures = (updates: Partial<PlatformFeatureFlags>) => {
    setPlatformFlags(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem("nzamy_platform_features", JSON.stringify(next));
      window.dispatchEvent(new Event("admin_features_changed"));
      return next;
    });
  };

  useEffect(() => {
    const handleLocalUpdate = () => {
      const stored = localStorage.getItem("nzamy_admin_features");
      if (stored) setFeatures(normalizeCompanyFeatures(JSON.parse(stored) as Record<string, StoredCompanyFeatures>));
      const storedFirm = localStorage.getItem("nzamy_admin_firm_features");
      if (storedFirm) setFirmFeatures(normalizeFirmFeatures(JSON.parse(storedFirm) as Record<string, StoredFirmFeatures>));
      const storedSectorProfiles = localStorage.getItem("nzamy_admin_sector_profiles");
      if (storedSectorProfiles) {
        setSectorProfiles(normalizeSectorProfiles(JSON.parse(storedSectorProfiles) as Partial<{
          government: Record<string, StoredGovernmentFeatures>;
          ngo: Record<string, StoredNgoFeatures>;
          micro: Record<string, StoredMicroFeatures>;
        }>));
      }
      const storedPlatformFlags = localStorage.getItem("nzamy_platform_features");
      if (storedPlatformFlags) setPlatformFlags(JSON.parse(storedPlatformFlags));
    };
    window.addEventListener("admin_features_changed", handleLocalUpdate);
    return () => window.removeEventListener("admin_features_changed", handleLocalUpdate);
  }, []);

  return {
    features,
    firmFeatures,
    sectorProfiles,
    platformFlags,
    updateCompanyFeatures,
    updateFirmFeatures,
    updateGovernmentProfile,
    updateNgoProfile,
    updateMicroProfile,
    updatePlatformFeatures,
    currentCompanyFeatures: features[MOCK_CURRENT_COMPANY_ID] || DEFAULT_FEATURES[MOCK_CURRENT_COMPANY_ID],
    currentFirmFeatures: firmFeatures[MOCK_CURRENT_FIRM_ID] || DEFAULT_FIRM_FEATURES[MOCK_CURRENT_FIRM_ID],
    currentGovernmentProfile: sectorProfiles.government[MOCK_CURRENT_GOVERNMENT_ID] || DEFAULT_SECTOR_PROFILES.government[MOCK_CURRENT_GOVERNMENT_ID],
    currentNgoProfile: sectorProfiles.ngo[MOCK_CURRENT_NGO_ID] || DEFAULT_SECTOR_PROFILES.ngo[MOCK_CURRENT_NGO_ID],
    currentMicroProfile: sectorProfiles.micro[MOCK_CURRENT_MICRO_ID] || DEFAULT_SECTOR_PROFILES.micro[MOCK_CURRENT_MICRO_ID],
    mounted
  };
}
export type { CompanyFeatures, FirmFeatures, GovernmentSectorFeatures, NgoSectorFeatures, MicroSectorFeatures, SectorProfilesState, PlatformFeatureFlags };
export {
  MOCK_CURRENT_COMPANY_ID,
  MOCK_CURRENT_FIRM_ID,
  MOCK_CURRENT_GOVERNMENT_ID,
  MOCK_CURRENT_NGO_ID,
  MOCK_CURRENT_MICRO_ID,
  DEFAULT_FEATURES,
  DEFAULT_FIRM_FEATURES,
  DEFAULT_SECTOR_PROFILES,
  DEFAULT_PLATFORM_FLAGS
};

