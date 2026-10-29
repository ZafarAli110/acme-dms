import CloseIcon from '@mui/icons-material/Close';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import {Box, Button, Card, CardContent, IconButton, LinearProgress, Stack, Typography} from '@mui/material';
import {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useExports} from '../../core/contexts/exports/useExports';
import type {ExportEntry} from '../../core/kernel/exportKernel';

const TICK_MS = 500;

function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * One export on the panel: what it is doing, how far it has got, its speed, how long it has taken and roughly how long
 * is left; then the download. The timer runs on between the server's updates.
 */
export function ExportCard({entry}: {entry: ExportEntry}) {
  const {t, i18n} = useTranslation();
  const {cancelAsync, dismiss} = useExports();
  const {job} = entry;
  const running = job.status === 'queued' || job.status === 'counting' || job.status === 'writing';
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);

  const number = (value: number): string => value.toLocaleString(i18n.language);
  const sinceUpdate = running ? Math.max(0, now - entry.receivedAt) : 0;
  const percent = job.totalRows ? Math.min(100, Math.floor((job.rows / job.totalRows) * 100)) : 0;
  const message = {
    queued: t('exports.queued', {position: job.queuePosition ?? 1}),
    counting: t('exports.counting'),
    writing:
      job.rows === 0
        ? t('exports.sorting', {total: number(job.totalRows ?? 0)})
        : t('exports.writing', {rows: number(job.rows), total: number(job.totalRows ?? 0)}),
    completed: t('exports.completed', {rows: number(job.rows)}),
    failed: job.error ?? t('exports.failed'),
    cancelled: t('exports.cancelled'),
    expired: t('exports.expired'),
  }[job.status];

  return (
    <Card elevation={6} sx={{width: 360}} data-testid="export-card">
      <CardContent sx={{pb: '12px !important'}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <Typography variant="subtitle2" sx={{flex: 1}} noWrap>
            {entry.title}
          </Typography>
          <IconButton size="small" onClick={() => dismiss(job.id)} aria-label={t('exports.close')}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography
          variant="body2"
          color={job.status === 'failed' ? 'error' : 'text.secondary'}
          data-testid="export-status"
        >
          {entry.problem ?? message}
        </Typography>
        {running && (
          <LinearProgress
            variant={job.totalRows && job.rows > 0 ? 'determinate' : 'indeterminate'}
            value={percent}
            sx={{my: 1}}
          />
        )}
        {running && (
          <Typography variant="caption" color="text.secondary" component="div">
            {[
              job.rowsPerSecond && t('exports.rate', {rate: number(job.rowsPerSecond)}),
              t('exports.elapsed', {time: clock(job.elapsedMs + sinceUpdate)}),
              job.etaMs !== null && t('exports.left', {time: clock(job.etaMs - sinceUpdate)}),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        )}
        <Stack direction="row" spacing={1} sx={{mt: 1}}>
          {running && (
            <Button size="small" onClick={() => void cancelAsync(job.id)} data-testid="export-cancel">
              {t('exports.cancel')}
            </Button>
          )}
          {job.status === 'completed' && job.downloadPath && (
            <Button
              size="small"
              variant="contained"
              startIcon={<FileDownloadIcon />}
              href={`${entry.serviceUrl}/${job.downloadPath}`}
              download={job.fileName}
              data-testid="export-download"
            >
              {t('exports.download', {size: ((job.fileBytes ?? 0) / 1_048_576).toFixed(1)})}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
