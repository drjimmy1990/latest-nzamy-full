"use client";

import { useEffect, useState } from "react";
import {
  CLIENT_GROUP_STORAGE_KEY,
  CLIENT_GROUP_UPDATED_EVENT,
  hasActiveClientGroup,
  readClientGroupState,
  type ClientGroupState,
} from "@/lib/clientGroupStore";

export function useClientGroupMembership() {
  const [state, setState] = useState<ClientGroupState>(() => readClientGroupState());

  useEffect(() => {
    const refresh = () => setState(readClientGroupState());
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLIENT_GROUP_STORAGE_KEY) refresh();
    };

    window.addEventListener(CLIENT_GROUP_UPDATED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    refresh();

    return () => {
      window.removeEventListener(CLIENT_GROUP_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return {
    ...state,
    hasGroup: hasActiveClientGroup(state),
  };
}
