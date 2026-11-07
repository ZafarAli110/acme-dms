import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PART_PHOTO_RULES } from "../constants/partPhotoRules";
import { isTakingLong, msUntilTakingLong } from "../formatters/photoProcessing";
import type { PartFormValues, PartPhoto } from "../types/part";
import { PartPhotoTile } from "./PartPhotoTile";

interface PartPhotosSectionProps {
  /** The photos as the server has them now, for their processing status (it changes while the form is open). */
  savedPhotos: PartPhoto[];
  disabled: boolean;
}

/**
 * The part's photos as part of the form: add, remove and choose the default here; nothing is saved until the page's
 * Save. One photo is always the default while there are photos.
 */
export function PartPhotosSection({ savedPhotos, disabled }: PartPhotosSectionProps) {
  // Polling stops at the limit, so nothing else renders this again: a timer shows the note when a photo reaches it.
  const [now, setNow] = useState(() => Date.now());
  const takingLong = isTakingLong(savedPhotos, now);
  useEffect(() => {
    const wait = msUntilTakingLong(savedPhotos, Date.now());
    if (wait === null) {
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [savedPhotos]);
  const { t } = useTranslation("parts");
  const { control, getValues, setValue, formState } = useFormContext<PartFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "photos", keyName: "fieldKey" });
  const listError = formState.errors.photos?.root?.message ?? formState.errors.photos?.message;

  const setDefault = (index: number) =>
    setValue(
      "photos",
      getValues("photos").map((photo, position) => ({ ...photo, isDefault: position === index })),
      { shouldDirty: true, shouldValidate: formState.isSubmitted },
    );

  const addFiles = (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    const hasDefault = getValues("photos").some((photo) => photo.isDefault);
    append(
      picked.map((file, index) => ({
        key: crypto.randomUUID(),
        photoId: null,
        documentId: null,
        file,
        fileName: file.name,
        isDefault: !hasDefault && index === 0,
      })),
      { shouldFocus: false },
    );
  };

  const removeAt = (index: number) => {
    const wasDefault = getValues(`photos.${index}.isDefault`);
    remove(index);
    if (wasDefault && getValues("photos").length > 0) {
      setDefault(0);
    }
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" sx={{ alignItems: "center", mb: 2, gap: 2 }}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          {t("edit.photos")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("edit.photoCount", { count: fields.length, max: PART_PHOTO_RULES.maxPerPart })}
        </Typography>
        {!disabled && (
          <Button variant="outlined" component="label" startIcon={<AddPhotoAlternateIcon />} data-testid="add-photos">
            {t("edit.addPhotos")}
            <input
              hidden
              type="file"
              multiple
              accept={PART_PHOTO_RULES.types.join(",")}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = "";
              }}
              data-testid="photo-input"
            />
          </Button>
        )}
      </Stack>
      {takingLong && (
        <Alert severity="info" sx={{ mb: 2 }} data-testid="photos-taking-long">
          {t("edit.photosTakingLong")}
        </Alert>
      )}
      {listError && (
        <Alert severity="error" sx={{ mb: 2 }} data-testid="photos-error">
          {listError}
        </Alert>
      )}
      {fields.length === 0 ? (
        <Typography color="text.secondary">{t("edit.noPhotos")}</Typography>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2 }}>
          {fields.map((field, index) => (
            <PartPhotoTile
              key={field.fieldKey}
              index={index}
              saved={savedPhotos.find((photo) => photo.id === field.photoId) ?? null}
              disabled={disabled}
              onMakeDefault={() => setDefault(index)}
              onRemove={() => removeAt(index)}
            />
          ))}
        </Box>
      )}
      {!disabled && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          {t("edit.photoTypes", { maxMb: PART_PHOTO_RULES.maxBytes / 1024 / 1024 })}
        </Typography>
      )}
    </Paper>
  );
}
