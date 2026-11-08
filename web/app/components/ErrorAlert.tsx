import { Alert } from "@mui/material";
import { useTranslation } from "react-i18next";
import { ApiError, isBusyError, RequestTimeoutError, ServerUnreachableError } from "../core/config/apiErrors";

/**
 * Shows an API error the way support needs it: what went wrong, plus the trace id to find it in Aspire. Busy reads as
 * "still busy" for data a page loads (it has tried again already), and as "nothing was saved" for a save (ACME-122).
 */
export function ErrorAlert({ error, during = "load" }: { error: unknown; during?: "load" | "save" }) {
  const { t } = useTranslation();
  if (!error) {
    return null;
  }
  // Problem details come from the services in English; failures with no answer are translated here.
  const busyMessage = during === "save" ? t("errors.busySave") : t("errors.stillBusy");
  const message = isBusyError(error)
    ? busyMessage
    : error instanceof ServerUnreachableError
      ? t("errors.serverUnreachable")
      : error instanceof RequestTimeoutError
        ? t("errors.timeout")
        : error instanceof Error
          ? error.message
          : String(error);
  const traceId = error instanceof ApiError ? error.problem.traceId : null;
  return (
    <Alert severity="error" sx={{ my: 2 }}>
      {message}
      {traceId && <div style={{ fontSize: 12, opacity: 0.7 }}>{t("errors.traceId", { traceId })}</div>}
    </Alert>
  );
}
