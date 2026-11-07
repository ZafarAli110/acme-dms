import { formatNumber } from "../../core/formatters/formatNumber";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { Alert, Box, Button, Chip, Grid, Paper, Stack, TextField, Typography } from "@mui/material";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useActionData, useNavigate, useNavigation, useSubmit } from "react-router";
import { FormGuards } from "../../components/FormGuards";
import { PageHeader } from "../../components/PageHeader";
import { PartPhotosSection } from "./components/PartPhotosSection";
import { toFormValues, toUpdateFormData } from "./mappers/partFormMapper";
import type { clientAction } from "./PartEdit";
import { createPartUpdateSchema } from "./schemas/partSchema";
import type { Part, PartFormValues } from "./types/part";

interface PartFormProps {
  /** The part as saved. The page remounts the form when it shows a newer version (useFormRevision). */
  part: Part;
  locationName: string;
  canEdit: boolean;
  /** Tells the page whether the form has unsaved changes, so a newer version never replaces them unasked. */
  onDirtyChange: (dirty: boolean) => void;
  /** Someone else saved a newer version while this form has unsaved changes. */
  changedElsewhere: boolean;
  /** Drops the unsaved changes and shows the newer version. */
  onShowLatest: () => void;
  /** Keeps the unsaved changes over the newer version: the form takes it in, so the next save is not refused. */
  onKeepMine: () => void;
}

/**
 * The part edit form: details, the stock here (read only) and the photos. One Save sends everything together through
 * the page's clientAction; nothing is saved before that.
 */
export function PartForm({
  part,
  locationName,
  canEdit,
  onDirtyChange,
  changedElsewhere,
  onShowLatest,
  onKeepMine,
}: PartFormProps) {
  const { t, i18n } = useTranslation("parts");
  const { t: tCommon } = useTranslation();
  const navigate = useNavigate();
  const submit = useSubmit();
  const actionData = useActionData<typeof clientAction>();
  const isSubmitting = useNavigation().state === "submitting";

  // The part as this form opened it: its version goes with a save, so a save over someone else's is refused (412), and
  // the unsaved edits are compared with it.
  const [opened, setOpened] = useState(part);
  const schema = useMemo(() => createPartUpdateSchema(t, i18n.language), [t, i18n.language]);
  const methods = useForm<PartFormValues>({
    resolver: valibotResolver(schema),
    defaultValues: toFormValues(opened, i18n.language),
  });
  const { isDirty } = methods.formState;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  const disabled = !canEdit || isSubmitting;

  const save = methods.handleSubmit((values) =>
    submit(toUpdateFormData(values, opened, i18n.language), { method: "post", encType: "multipart/form-data" }),
  );

  // Their version under the user's edits: what the user did not touch becomes theirs, then the form saves from theirs.
  const keepMine = (): void => {
    const theirs = toFormValues(part, i18n.language);
    const { dirtyFields } = methods.formState;
    for (const field of ["description", "unitPrice", "photos"] as const) {
      if (!dirtyFields[field]) {
        methods.setValue(field, theirs[field]);
      }
    }
    setOpened(part);
    onKeepMine();
  };

  return (
    <FormProvider {...methods}>
      <PageHeader
        title={part.partNumber}
        subtitle={part.description}
        trail={[{ label: t("title"), to: "/parts" }]}
        actions={
          canEdit && (
            <Fragment>
              <Button onClick={() => navigate("/parts")} disabled={isSubmitting} data-testid="cancel">
                {tCommon("actions.cancel")}
              </Button>
              <Button
                type="submit"
                form="part-form"
                variant="contained"
                disabled={!isDirty || isSubmitting}
                data-testid="save-part"
              >
                {isSubmitting ? tCommon("actions.saving") : tCommon("actions.save")}
              </Button>
            </Fragment>
          )
        }
      />
      <FormGuards isDirty={isDirty && !isSubmitting} redirectTo="/parts" />
      {changedElsewhere && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Fragment>
              <Button color="inherit" size="small" onClick={keepMine} data-testid="keep-mine">
                {tCommon("revision.keepMine")}
              </Button>
              <Button color="inherit" size="small" onClick={onShowLatest} data-testid="show-latest">
                {tCommon("revision.showLatest")}
              </Button>
            </Fragment>
          }
          data-testid="changed-elsewhere"
        >
          {tCommon("revision.changedElsewhere")}
        </Alert>
      )}
      {actionData?.error && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="save-error">
          {actionData.error}
        </Alert>
      )}
      {actionData?.saved && !isDirty && (
        <Alert severity="success" sx={{ mb: 2 }} data-testid="save-success">
          {t("edit.saved")}
        </Alert>
      )}
      <Box
        component="form"
        id="part-form"
        noValidate
        onSubmit={save}
        sx={{ opacity: isSubmitting ? 0.6 : 1, pointerEvents: isSubmitting ? "none" : "auto" }}
      >
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t("edit.details")}
              </Typography>
              <Stack spacing={2}>
                <TextField label={t("columns.partNumber")} value={part.partNumber} disabled fullWidth />
                <Controller
                  control={methods.control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label={t("columns.description")}
                      required
                      fullWidth
                      disabled={disabled}
                      error={fieldState.invalid}
                      helperText={fieldState.error?.message}
                      data-testid="part-description"
                    />
                  )}
                />
                <Controller
                  control={methods.control}
                  name="unitPrice"
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      label={t("columns.unitPrice")}
                      required
                      fullWidth
                      disabled={disabled}
                      slotProps={{ htmlInput: { inputMode: "decimal" } }}
                      error={fieldState.invalid}
                      helperText={fieldState.error?.message}
                      data-testid="part-unit-price"
                    />
                  )}
                />
              </Stack>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t("edit.stockHere", { location: locationName })}
              </Typography>
              <Stack spacing={1}>
                <Typography>
                  {t("columns.bin")}: <strong>{part.inventory.binCode}</strong>
                </Typography>
                <Typography>
                  {t("columns.onHand")}: <strong>{formatNumber(part.inventory.quantityOnHand, i18n.language)}</strong>
                </Typography>
                <Typography>
                  {t("columns.reorderLevel")}: <strong>{part.inventory.reorderLevel}</strong>
                </Typography>
                {part.inventory.belowReorderLevel && (
                  <Box>
                    <Chip size="small" color="warning" label={t("edit.belowReorder")} />
                  </Box>
                )}
                <Typography variant="caption" color="text.secondary">
                  {t("edit.stockReadOnly")}
                </Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid size={12}>
            <PartPhotosSection savedPhotos={part.photos} disabled={disabled} />
          </Grid>
        </Grid>
      </Box>
    </FormProvider>
  );
}
