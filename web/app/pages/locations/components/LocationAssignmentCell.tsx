import {Alert, Box, Snackbar, Switch, Tooltip} from '@mui/material';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {useFetcher} from 'react-router';
import {useAuth} from '../../../core/contexts/auth/useAuth';
import {useDealerLocations} from '../hooks/useDealerLocations';
import type {AssignmentIntent, AssignmentResult, DealerUser} from '../types/dealerUser';

/**
 * Whether the user works at the location, as a switch. Turning it submits to the route's clientAction; while that
 * runs the switch already shows the new state, and goes back if it fails. A manager's own row is locked.
 */
export function LocationAssignmentCell({user, locationId}: {user: DealerUser; locationId: string}) {
  const {t} = useTranslation('locations');
  const location = useDealerLocations().data?.find((candidate) => candidate.id === locationId);
  const {user: me} = useAuth();
  const fetcher = useFetcher<AssignmentResult>({key: `assignment:${user.id}:${locationId}`});
  // The answer the user closed: a refusal (a user's last location) shows once per attempt.
  const [dismissed, setDismissed] = useState<AssignmentResult | null>(null);
  const refusal = fetcher.data && fetcher.data !== dismissed ? fetcher.data.error : null;
  const pending = fetcher.formData?.get('intent') as AssignmentIntent | undefined;
  const assigned = pending ? pending === 'assign' : user.locationIds.includes(locationId);
  const isMe = user.id === me?.id;
  const label = t(assigned ? 'unassign' : 'assign', {name: user.displayName, location: location?.name ?? ''});

  const toggle = (): void => {
    void fetcher.submit({userId: user.id, locationId, intent: assigned ? 'unassign' : 'assign'}, {method: 'post'});
  };

  return (
    <Box sx={{display: 'flex', alignItems: 'center', height: '100%'}}>
      <Tooltip title={isMe ? t('notYourself') : label}>
        <span>
          <Switch
            checked={assigned}
            disabled={isMe || fetcher.state !== 'idle'}
            onChange={toggle}
            slotProps={{input: {'aria-label': label}}}
            data-testid={`assignment-${user.email}-${location?.code ?? locationId}`}
          />
        </span>
      </Tooltip>
      <Snackbar open={refusal !== null} autoHideDuration={6000} onClose={() => setDismissed(fetcher.data ?? null)}>
        <Alert
          severity="error"
          variant="filled"
          onClose={() => setDismissed(fetcher.data ?? null)}
          data-testid="assignment-error"
        >
          {refusal}
        </Alert>
      </Snackbar>
    </Box>
  );
}
