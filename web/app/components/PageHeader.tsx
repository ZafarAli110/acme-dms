import {Box, Breadcrumbs, Link, Stack, Typography} from '@mui/material';
import type {ReactNode} from 'react';
import {Link as RouterLink} from 'react-router';

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Links back up the hierarchy, e.g. [{label: 'Parts', to: '/parts'}]. */
  trail?: {label: string; to: string}[];
  actions?: ReactNode;
}

export function PageHeader({title, subtitle, trail, actions}: PageHeaderProps) {
  return (
    <Box sx={{mb: 3}}>
      {trail && (
        <Breadcrumbs sx={{mb: 1}}>
          {trail.map((crumb) => (
            <Link key={crumb.to} component={RouterLink} to={crumb.to} underline="hover" color="text.secondary">
              {crumb.label}
            </Link>
          ))}
          <Typography color="text.primary">{title}</Typography>
        </Breadcrumbs>
      )}
      <Stack direction={{xs: 'column', sm: 'row'}} sx={{alignItems: {sm: 'center'}, gap: 2}}>
        <Box sx={{flexGrow: 1, minWidth: 0}}>
          <Typography variant="h5" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary" sx={{mt: 0.5}}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && (
          <Stack direction="row" sx={{gap: 1, alignItems: 'center'}}>
            {actions}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
