import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import {Box, Typography} from '@mui/material';

export function AcmeLogo({compact = false}: {compact?: boolean}) {
  return (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.25}}>
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          flexShrink: 0,
        }}
      >
        <DirectionsCarIcon fontSize="small" />
      </Box>
      {!compact && (
        <Typography variant="subtitle1" sx={{fontWeight: 700, letterSpacing: 0.2}} noWrap>
          Acme DMS
        </Typography>
      )}
    </Box>
  );
}
