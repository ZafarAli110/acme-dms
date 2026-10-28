import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientActionFunctionArgs, Form, redirect, useActionData, useNavigation} from 'react-router';
import {AcmeLogo} from '../components/AcmeLogo';
import {ApiError, problemErrorMessage} from '../core/config/apiErrors';
import {authKernel} from '../core/kernel/authKernel';
import {i18n} from '../i18n';

const DEMO_PASSWORD = 'Acme123!';
const DEMO_USERS = [
  {email: 'alice@northwind.test', key: 'alice'},
  {email: 'maria@northwind.test', key: 'maria'},
  {email: 'sam@northwind.test', key: 'sam'},
  {email: 'tom@northwind.test', key: 'tom'},
  {email: 'bob@northwind.test', key: 'bob'},
  {email: 'carol@contoso.test', key: 'carol'},
] as const;

/** Someone already signed in goes straight to Home. */
export async function clientLoader() {
  const auth = await authKernel.waitForResolvedAuthAsync();
  if (auth.status === 'signed-in') {
    throw redirect('/');
  }
  return null;
}

/** Signs in with the submitted email and password, then goes to Home; a failure comes back as `{error}`. */
export async function clientAction({request}: ClientActionFunctionArgs) {
  const form = await request.formData();
  try {
    await authKernel.signInAsync(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return {error: i18n.t('sign-in:invalidCredentials')};
    }
    return {error: problemErrorMessage(error, i18n.t('errors.unexpected'))};
  }
  return redirect('/');
}

export default function SignIn() {
  const {t} = useTranslation('sign-in');
  const actionData = useActionData<typeof clientAction>();
  const isSubmitting = useNavigation().state === 'submitting';
  // The fields are controlled only so that picking a demo user fills them in; the Form submits their values.
  const [email, setEmail] = useState('alice@northwind.test');
  const [password, setPassword] = useState(DEMO_PASSWORD);

  return (
    <Box sx={{display: 'grid', placeItems: 'center', minHeight: '100vh', bgcolor: 'background.default', p: 2}}>
      <Card variant="outlined" sx={{width: '100%', maxWidth: 420}}>
        <CardContent sx={{p: 4}}>
          <AcmeLogo />
          <Typography variant="h5" sx={{mt: 3}}>
            {t('title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('subtitle')}
          </Typography>
          <Form method="post">
            <Stack spacing={2} sx={{mt: 3}}>
              <TextField
                name="email"
                label={t('email')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoFocus
                data-testid="email"
              />
              <TextField
                name="password"
                label={t('password')}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                data-testid="password"
              />
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting} data-testid="sign-in">
                {isSubmitting ? t('signingIn') : t('signIn')}
              </Button>
            </Stack>
          </Form>
          {actionData?.error && (
            <Alert severity="error" sx={{my: 2}} data-testid="sign-in-error">
              {actionData.error}
            </Alert>
          )}
          <Divider sx={{my: 3}}>
            <Typography variant="caption" color="text.secondary">
              {t('demoUsers', {password: DEMO_PASSWORD})}
            </Typography>
          </Divider>
          <List dense disablePadding>
            {DEMO_USERS.map((demo) => (
              <ListItemButton
                key={demo.email}
                selected={demo.email === email}
                onClick={() => {
                  setEmail(demo.email);
                  setPassword(DEMO_PASSWORD);
                }}
                sx={{borderRadius: 1}}
              >
                <ListItemText primary={demo.email} secondary={t(`demoUser.${demo.key}`)} />
              </ListItemButton>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  );
}
