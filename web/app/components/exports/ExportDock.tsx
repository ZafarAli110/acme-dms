import { Stack } from "@mui/material";
import { useExports } from "../../core/contexts/exports/useExports";
import { APPBAR_HEIGHT } from "../Sidebar";
import { ExportCard } from "./ExportCard";

/** The exports this tab started, top right under the app bar, so one keeps reporting while the user works elsewhere. */
export function ExportDock() {
  const { exports } = useExports();
  if (exports.length === 0) {
    return null;
  }
  return (
    <Stack
      spacing={1}
      sx={{ position: "fixed", right: 16, top: APPBAR_HEIGHT + 16, zIndex: (theme) => theme.zIndex.snackbar }}
    >
      {exports.map((entry) => (
        <ExportCard key={entry.job.id} entry={entry} />
      ))}
    </Stack>
  );
}
