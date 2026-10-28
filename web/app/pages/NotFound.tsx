import {Button, Stack, Typography} from '@mui/material';
import {useTranslation} from 'react-i18next';
import {Link as RouterLink} from 'react-router';

export default function NotFound() {
  const {t} = useTranslation();
  return (
    <Stack sx={{alignItems: 'center', gap: 2, py: 8}}>
      <Typography variant="h5">{t('notFound.title')}</Typography>
      <Typography color="text.secondary">{t('notFound.body')}</Typography>
      <Button variant="contained" component={RouterLink} to="/">
        {t('notFound.home')}
      </Button>
    </Stack>
  );
}
