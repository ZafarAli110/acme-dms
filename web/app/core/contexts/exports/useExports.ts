import { useSyncExternalStore } from "react";
import { type ExportEntry, type ExportJob, exportKernel } from "../../kernel/exportKernel";
import { useSelectedLocation } from "../location/useSelectedLocation";

// Module-level, so useSyncExternalStore gets the same functions on every render and subscribes once.
function subscribe(listener: () => void): () => void {
  return exportKernel.subscribe(listener);
}

function getSnapshot(): ExportEntry[] {
  return exportKernel.getSnapshot();
}

/** The user's exports at the selected location, from the export kernel; the others come back on switching back. */
export function useExports() {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  const { location } = useSelectedLocation();
  return {
    exports: all.filter((entry) => entry.locationId === location?.id),
    startAsync: (title: string, serviceUrl: string, path: string, body: unknown) =>
      exportKernel.startAsync(title, serviceUrl, path, body),
    restoreAsync: (serviceUrl: string, titleOf: (job: ExportJob) => string) =>
      exportKernel.restoreAsync(serviceUrl, titleOf),
    cancelAsync: (jobId: string) => exportKernel.cancelAsync(jobId),
    dismiss: (jobId: string) => exportKernel.dismiss(jobId),
    retry: (jobId: string) => exportKernel.retry(jobId),
  };
}
