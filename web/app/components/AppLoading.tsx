import {Box, CircularProgress} from '@mui/material';

/** Shown while the router resolves the signed-in user and location on first load. */
export function AppLoading() {
  return (
    <Box sx={{display: 'grid', placeItems: 'center', height: '100vh'}}>
      <CircularProgress />
    </Box>
  );
}
