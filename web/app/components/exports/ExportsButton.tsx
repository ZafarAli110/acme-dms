import DownloadIcon from "@mui/icons-material/Download";
import { Badge, Box, CircularProgress, Divider, IconButton, Popover, Stack, Tooltip } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useExports } from "../../core/contexts/exports/useExports";
import type { ExportEntry } from "../../core/kernel/exportKernel";
import { ExportCard } from "./ExportCard";

// Wider than the 40px button, so the ring clears the icon's corners; centred on the button, not pinned to its corner.
const RING_SIZE = 46;

function isRunning(entry: ExportEntry): boolean {
  return entry.job.status === "queued" || entry.job.status === "counting" || entry.job.status === "writing";
}

/** How far the running exports have got together, 0–100; 0 until rows are written, so the ring never runs back. */
function progressOf(running: ExportEntry[]): number {
  const total = running.reduce((sum, entry) => sum + (entry.job.totalRows ?? 0), 0);
  const rows = running.reduce((sum, entry) => sum + entry.job.rows, 0);
  return total ? Math.min(100, Math.floor((rows / total) * 100)) : 0;
}

/**
 * The exports this tab started, behind one button in the top bar, like a browser's downloads: a ring while one runs, a
 * dot when one is ready. The panel opens by itself when an export starts; otherwise nothing covers the page.
 */
export function ExportsButton() {
  const { t } = useTranslation();
  const { exports } = useExports();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const count = exports.length;
  const previousCount = useRef(count);

  useEffect(() => {
    if (count > previousCount.current) {
      setOpen(true);
    }
    if (count === 0) {
      setOpen(false);
    }
    previousCount.current = count;
  }, [count]);

  if (count === 0) {
    return null;
  }

  const running = exports.filter(isRunning);
  const ready = exports.some((entry) => entry.job.status === "completed" && !seen.has(entry.job.id));
  const close = (): void => {
    setSeen(new Set(exports.filter((entry) => entry.job.status === "completed").map((entry) => entry.job.id)));
    setOpen(false);
  };

  return (
    <Box sx={{ position: "relative", display: "inline-flex" }}>
      <Tooltip title={t("exports.panel")}>
        <IconButton
          ref={anchor}
          color="inherit"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={t("exports.panel")}
          data-testid="exports-button"
        >
          <Badge color="success" variant="dot" invisible={!ready}>
            <DownloadIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      {running.length > 0 && (
        <CircularProgress
          variant="determinate"
          value={progressOf(running)}
          size={RING_SIZE}
          thickness={2.5}
          sx={{
            position: "absolute",
            // Centred with margins, not transform: the determinate ring already uses transform to start at 12 o'clock.
            top: "50%",
            left: "50%",
            mt: `-${RING_SIZE / 2}px`,
            ml: `-${RING_SIZE / 2}px`,
            color: "inherit",
            pointerEvents: "none",
          }}
        />
      )}
      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { mt: 1 } } }}
      >
        <Stack divider={<Divider flexItem />}>
          {exports.map((entry) => (
            <ExportCard key={entry.job.id} entry={entry} />
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}
