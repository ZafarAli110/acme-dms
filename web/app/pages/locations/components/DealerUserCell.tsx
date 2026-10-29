import {Box, Typography} from '@mui/material';
import type {DealerUser} from '../types/dealerUser';

/** A person's name and email in a grid row. */
export function DealerUserCell({user}: {user: DealerUser}) {
  return (
    <Box sx={{display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', lineHeight: 1.2}}>
      <Typography variant="body2" sx={{fontWeight: 600}}>
        {user.displayName}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {user.email}
      </Typography>
    </Box>
  );
}
