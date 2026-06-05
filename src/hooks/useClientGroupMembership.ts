"use client";

import { useEffect, useState, useCallback } from "react";
import { isSupabaseMode } from "@/lib/services/api";
import {
  getGroupState,
  hasActiveClientGroup,
  CLIENT_GROUP_STORAGE_KEY,
  CLIENT_GROUP_UPDATED_EVENT,
} from "@/lib/services/groupService";
import type { ClientGroupState } from "@/lib/services/groupService";
import {
  readClientGroupState,
} from "@/lib/clientGroupStore";

export function useClientGroupMembership() {
  const [state, setState] = useState<ClientGroupState>(() => readClientGroupState());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const newState = await getGroupState();
      setState(newState);
    } catch {
      setState(readClientGroupState());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Demo mode: listen for localStorage changes
    if (!isSupabaseMode) {
      const onRefresh = () => setState(readClientGroupState());
      const onStorage = (event: StorageEvent) => {
        if (event.key === CLIENT_GROUP_STORAGE_KEY) onRefresh();
      };

      window.addEventListener(CLIENT_GROUP_UPDATED_EVENT, onRefresh);
      window.addEventListener("storage", onStorage);

      return () => {
        window.removeEventListener(CLIENT_GROUP_UPDATED_EVENT, onRefresh);
        window.removeEventListener("storage", onStorage);
      };
    }
  }, [refresh]);

  return {
    ...state,
    hasGroup: hasActiveClientGroup(state),
    loading,
    refresh,
  };
}
