import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import {Box, Chip, IconButton, Paper, Stack, Tooltip, Typography} from '@mui/material';
import {useEffect, useMemo} from 'react';
import {useFormContext, useWatch} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {DocumentImage} from '../../../components/DocumentImage';
import type {PartFormValues, PartPhoto} from '../types/part';

const STATUS_COLOUR = {new: 'info', pending: 'default', ready: 'success', failed: 'error'} as const;

interface PartPhotoTileProps {
  index: number;
  /** The saved photo, for its processing status; null for a new file. */
  saved: PartPhoto | null;
  disabled: boolean;
  onMakeDefault: () => void;
  onRemove: () => void;
}

export function PartPhotoTile({index, saved, disabled, onMakeDefault, onRemove}: PartPhotoTileProps) {
  const {t} = useTranslation('parts');
  const {control, formState} = useFormContext<PartFormValues>();
  const photo = useWatch({control, name: `photos.${index}`});
  const fileError = formState.errors.photos?.[index]?.file?.message;
  const status = saved?.status ?? 'new';

  return (
    <Paper
      variant="outlined"
      sx={{p: 1, borderColor: photo.isDefault ? 'primary.main' : 'divider', borderWidth: photo.isDefault ? 2 : 1}}
      data-testid="photo-tile"
    >
      <Box sx={{aspectRatio: '1', mb: 1, overflow: 'hidden', borderRadius: 1, bgcolor: 'action.hover'}}>
        {photo.file ? (
          <NewPhotoPreview file={photo.file} />
        ) : photo.documentId && status === 'ready' ? (
          <DocumentImage documentId={photo.documentId} variant="thumb" size="100%" />
        ) : null}
      </Box>
      <Typography variant="caption" noWrap title={photo.fileName} sx={{display: 'block'}}>
        {photo.fileName}
      </Typography>
      <Stack direction="row" sx={{alignItems: 'center', gap: 0.5, mt: 0.5}}>
        <Chip
          size="small"
          color={STATUS_COLOUR[status]}
          label={t(`edit.photoStatus.${status}`)}
          title={saved?.failureReason ?? undefined}
          sx={{maxWidth: '100%', flexShrink: 1}}
        />
        <Box sx={{flexGrow: 1}} />
        <Tooltip title={photo.isDefault ? t('edit.isDefault') : t('edit.makeDefault')}>
          <span>
            <IconButton
              size="small"
              color={photo.isDefault ? 'primary' : 'default'}
              onClick={onMakeDefault}
              disabled={disabled || photo.isDefault}
              aria-label={photo.isDefault ? t('edit.isDefault') : t('edit.makeDefault')}
              data-testid="photo-default"
            >
              {photo.isDefault ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
        {!disabled && (
          <Tooltip title={t('edit.removePhoto')}>
            <IconButton size="small" onClick={onRemove} aria-label={t('edit.removePhoto')} data-testid="photo-remove">
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {fileError && (
        <Typography variant="caption" color="error" sx={{display: 'block', mt: 0.5}}>
          {fileError}
        </Typography>
      )}
    </Paper>
  );
}

/** A picked file shown before it is saved. The object URL is released when the tile goes. */
function NewPhotoPreview({file}: {file: File}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <Box component="img" src={url} alt="" sx={{width: '100%', height: '100%', objectFit: 'cover'}} />;
}
