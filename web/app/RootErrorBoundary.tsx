import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import {Box, Button, Typography} from '@mui/material';
import {useTranslation} from 'react-i18next';
import {isRouteErrorResponse, useRouteError} from 'react-router';

/** The last line of defence: an error no page handled. In-page errors (failed queries, saves) are shown inline. */
export function RootErrorBoundary() {
  const {t} = useTranslation();
  const error = useRouteError();
  let title = t('errors.title');
  let detail = t('errors.unexpected');
  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = String(error.data ?? '');
  } else if (error instanceof Error) {
    detail = error.message;
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 4,
        textAlign: 'center',
      }}
    >
      <ErrorOutlineIcon sx={{fontSize: 64, color: 'error.main', mb: 2}} />
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{mb: 3, maxWidth: 480}}>
        {detail}
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        {t('errors.reload')}
      </Button>
    </Box>
  );
}
