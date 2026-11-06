import { useSyncExternalStore } from "react";
import { type ExportEntry, type ExportJob, exportKernel } from "../../kernel/exportKernel";

// Module-level, so useSyncExternalStore gets the same functions on every render and subscribes once.
function subscribe(listener: () => void): () => void {
  return exportKernel.subscribe(listener);
}

function getSnapshot(): ExportEntry[] {
  return exportKernel.getSnapshot();
}

/** The user's exports, from the export kernel. */
export function useExports() {
  const exports = useSyncExternalStore(subscribe, getSnapshot);
  return {
    exports,
    startAsync: (title: string, serviceUrl: string, path: string, body: unknown) =>
      exportKernel.startAsync(title, serviceUrl, path, body),
    restoreAsync: (serviceUrl: string, titleOf: (job: ExportJob) => string) =>
      exportKernel.restoreAsync(serviceUrl, titleOf),
    cancelAsync: (jobId: string) => exportKernel.cancelAsync(jobId),
    dismiss: (jobId: string) => exportKernel.dismiss(jobId),
  };
}
