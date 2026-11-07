import { Alert, Button, Skeleton, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";
import {
  type ClientActionFunctionArgs,
  type ClientLoaderFunctionArgs,
  Link as RouterLink,
  useActionData,
  useParams,
} from "react-router";
import { problemErrorMessage } from "../../core/config/apiErrors";
import { useSelectedLocation } from "../../core/contexts/location/useSelectedLocation";
import { useFormRevision } from "../../core/hooks/useFormRevision";
import { RESOLVED_LOCATION_CONTEXT } from "../../core/middleware/routerContext";
import { queryClient } from "../../core/queries/queryClient";
import { i18n } from "../../i18n";
import { usePart } from "./hooks/usePart";
import { PartForm } from "./PartForm";
import { partQueries } from "./queries/partQueries";
import { partQueryOptions } from "./queries/partQueryOptions";
import { PART_QUERY_KEYS } from "./queries/partQueryKey";

/** Fetches the part before the page shows. A part not stocked here is shown by the page, not thrown. */
export async function clientLoader({ context, params }: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  const partId = params["partId"];
  if (resolved && partId) {
    await queryClient
      .query({ ...partQueryOptions.detail(resolved.locationId, partId), staleTime: "static" })
      .catch(() => null);
  }
  return null;
}

/** One Save: the form's multipart body goes to the service as it is; the part and its photos are saved together. */
export async function clientAction({ request, context, params }: ClientActionFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  const partId = params["partId"];
  if (!resolved || !partId) {
    return { saved: false, error: i18n.t("errors.unexpected") };
  }
  try {
    // Sent for the location the user saw when they pressed Save, even if another is selected by now.
    const form = await request.formData();
    const locationId = String(form.get("locationId") ?? resolved.locationId);
    form.delete("locationId");
    await partQueries.updatePartAsync(partId, form, { locationId });
  } catch (error) {
    return { saved: false, error: problemErrorMessage(error, i18n.t("errors.unexpected")) };
  }
  await queryClient.invalidateQueries({ queryKey: PART_QUERY_KEYS.all(resolved.locationId) });
  return { saved: true, error: null };
}

export default function PartEdit() {
  const { t } = useTranslation("parts");
  const { partId = "" } = useParams();
  const { location, can } = useSelectedLocation();
  const { data: part, error, isLoading } = usePart(location?.id ?? "", partId);
  const revision = useFormRevision(part?.updatedAt ?? "", useActionData<typeof clientAction>());

  if (isLoading) {
    return <Skeleton variant="rounded" height={420} />;
  }
  if (!part) {
    return (
      <Stack sx={{ gap: 2, alignItems: "flex-start" }}>
        <Alert severity="warning" data-testid="part-not-found">
          {error ? t("edit.notFound", { location: location?.name ?? "" }) : null}
        </Alert>
        <Button component={RouterLink} to="/parts">
          {t("edit.backToList")}
        </Button>
      </Stack>
    );
  }
  // Keyed by the version it shows: it starts again from a newer one only when no unsaved edit is lost (useFormRevision).
  return (
    <PartForm
      key={revision.formKey}
      part={part}
      locationName={location?.name ?? ""}
      canEdit={can("parts.write")}
      onDirtyChange={revision.onDirtyChange}
      changedElsewhere={revision.changedElsewhere}
      onShowLatest={revision.showLatest}
    />
  );
}
