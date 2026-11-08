import { Alert, Snackbar } from "@mui/material";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { isRetryingBusy } from "../core/queries/busyQueries";
import { queryClient } from "../core/queries/queryClient";

const cache = queryClient.getQueryCache();

function subscribe(onChange: () => void): () => void {
  return cache.subscribe(onChange);
}

function snapshot(): boolean {
  return isRetryingBusy(cache.getAll());
}

/**
 * "The system is busy, trying again…" at the bottom of the screen while any page's data is being tried again after a
 * busy answer (ACME-122). Mounted once in `RootLayout`, so it shows on the first load and before the menu exists too;
 * it reads one boolean from the cache, so it renders only when that changes.
 */
export function BusyNotice() {
  const { t } = useTranslation();
  const retrying = useSyncExternalStore(subscribe, snapshot, () => false);
  return (
    <Snackbar open={retrying} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      <Alert severity="info" variant="filled" data-testid="busy-notice">
        {t("errors.busyRetrying")}
      </Alert>
    </Snackbar>
  );
}
