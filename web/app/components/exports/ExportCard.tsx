import CloseIcon from "@mui/icons-material/Close";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { Box, Button, Card, CardContent, IconButton, LinearProgress, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExports } from "../../core/contexts/exports/useExports";
import { formatFileSize } from "../../core/formatters/formatNumber";
import { type ExportEntry, isRunning } from "../../core/kernel/exportKernel";

const TICK_MS = 500;

/**
 * A duration as people say it, in the page's language: "42 seconds", "1 minute, 5 seconds" (fr: "1 minute et 5
 * secondes"). `rough` rounds to whole minutes past the first one, for an estimate ("about 3 minutes left").
 */
function duration(ms: number, language: string, rough = false): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const unit = (value: number, name: "hour" | "minute" | "second"): string =>
    new Intl.NumberFormat(language, { style: "unit", unit: name, unitDisplay: "long" }).format(value);
  if (seconds < 60) {
    return unit(seconds, "second");
  }
  if (rough) {
    return unit(Math.round(seconds / 60), "minute");
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [
    hours > 0 ? unit(hours, "hour") : null,
    minutes > 0 ? unit(minutes, "minute") : null,
    rest > 0 ? unit(rest, "second") : null,
  ].filter((part): part is string => part !== null);
  return new Intl.ListFormat(language, { type: "unit", style: "long" }).format(parts);
}

/**
 * One export in the exports panel: what it is doing, how far it has got, its speed, how long it has taken and roughly
 * how long is left; then the download. The timer runs on between the server's updates.
 */
export function ExportCard({ entry }: { entry: ExportEntry }) {
  const { t, i18n } = useTranslation();
  const { cancelAsync, dismiss, retry } = useExports();
  const { job } = entry;
  const running = isRunning(entry);
  // The timer runs on only while the service is heard from: a card that lost touch shows that, not a climbing clock.
  const ticking = running && entry.connection === "following";
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  const number = (value: number): string => value.toLocaleString(i18n.language);
  const sinceUpdate = ticking ? Math.max(0, now - entry.receivedAt) : 0;
  const percent = job.totalRows ? Math.min(100, Math.floor((job.rows / job.totalRows) * 100)) : 0;
  const message = {
    queued: t("exports.queued", { position: job.queuePosition ?? 1 }),
    counting: t("exports.counting"),
    writing:
      job.rows === 0
        ? t("exports.sorting", { total: number(job.totalRows ?? 0) })
        : t("exports.writing", { rows: number(job.rows), total: number(job.totalRows ?? 0) }),
    completed: t("exports.completed", { rows: number(job.rows), time: duration(job.elapsedMs, i18n.language) }),
    failed: job.error ?? t("exports.failed"),
    cancelled: t("exports.cancelled"),
    expired: t("exports.expired"),
  }[job.status];
  const connection = {
    following: null,
    reconnecting: t("exports.reconnecting"),
    stalled: t("exports.stalled"),
    lost: t("exports.lost"),
  }[entry.connection];

  return (
    <Card elevation={0} sx={{ width: 360, bgcolor: "transparent" }} data-testid="export-card">
      <CardContent sx={{ pb: "12px !important" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {entry.title}
          </Typography>
          <IconButton size="small" onClick={() => dismiss(job.id)} aria-label={t("exports.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography
          variant="body2"
          color={job.status === "failed" ? "error" : "text.secondary"}
          data-testid="export-status"
        >
          {connection ?? entry.problem ?? message}
        </Typography>
        {running && (
          // Determinate from the start, at 0% until rows are written: switching from the moving indeterminate stripe to
          // a bar near 0% looked like progress going backwards. The status line and the timer show it is working.
          <LinearProgress variant="determinate" value={percent} sx={{ my: 1 }} />
        )}
        {running && (
          <Typography variant="caption" color="text.secondary" component="div">
            {[
              job.rowsPerSecond && t("exports.rate", { rate: number(job.rowsPerSecond) }),
              t("exports.elapsed", { time: duration(job.elapsedMs + sinceUpdate, i18n.language) }),
              job.etaMs !== null && t("exports.left", { time: duration(job.etaMs - sinceUpdate, i18n.language, true) }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {entry.connection === "stalled" && (
            <Button size="small" onClick={() => retry(job.id)} data-testid="export-retry">
              {t("exports.retry")}
            </Button>
          )}
          {running && (
            <Button size="small" onClick={() => void cancelAsync(job.id)} data-testid="export-cancel">
              {t("exports.cancel")}
            </Button>
          )}
          {job.status === "completed" && job.downloadPath && (
            <Button
              size="small"
              variant="contained"
              startIcon={<FileDownloadIcon />}
              href={`${entry.serviceUrl}/${job.downloadPath}`}
              download={job.fileName}
              // Once the download starts the card has done its job. Wait a tick, so the browser follows the link first.
              onClick={() => setTimeout(() => dismiss(job.id), 0)}
              data-testid="export-download"
            >
              {t("exports.download", { size: formatFileSize(job.fileBytes ?? 0, i18n.language) })}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
