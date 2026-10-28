import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import PeopleIcon from '@mui/icons-material/People';
import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import {Fragment} from 'react';
import type {ReactElement} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientLoaderFunctionArgs, Link as RouterLink} from 'react-router';
import {PageHeader} from '../components/PageHeader';
import {useAuth} from '../core/contexts/auth/useAuth';
import {useSelectedLocation} from '../core/contexts/location/useSelectedLocation';
import {formatDaysAgo, formatPlainDate} from '../core/formatters/formatDate';
import {formatRole} from '../core/formatters/formatRole';
import {RESOLVED_LOCATION_CONTEXT} from '../core/middleware/routerContext';
import {queryClient} from '../core/queries/queryClient';
import {CustomerStatusChip} from './customers/components/CustomerStatusChip';
import {useCustomerCount} from './customers/hooks/useCustomerCount';
import {useRecentCustomers} from './customers/hooks/useRecentCustomers';
import {customerQueryOptions} from './customers/queries/customerQueryOptions';
import {usePartCount} from './parts/hooks/usePartCount';
import {partQueryOptions} from './parts/queries/partQueryOptions';

/** Fetches what Home shows at the selected location, only what the user may read there, before the page shows. */
export async function clientLoader({context}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (!resolved) {
    return null;
  }
  const {locationId, permissions} = resolved;
  const prefetches: Promise<unknown>[] = [];
  if (permissions.includes('parts.read')) {
    prefetches.push(queryClient.query({...partQueryOptions.count(locationId), staleTime: 'static'}));
  }
  if (permissions.includes('customers.read')) {
    prefetches.push(
      queryClient.query({...customerQueryOptions.count(locationId), staleTime: 'static'}),
      queryClient.query({...customerQueryOptions.recent(locationId), staleTime: 'static'}),
    );
  }
  // A failure is shown by the page's hooks, not thrown.
  await Promise.allSettled(prefetches);
  return null;
}

interface ShortcutProps {
  to: string;
  icon: ReactElement;
  title: string;
  count: number | undefined;
  caption: string;
  testId: string;
}

function Shortcut({to, icon, title, count, caption, testId}: ShortcutProps) {
  return (
    <Card sx={{height: '100%'}}>
      <CardActionArea component={RouterLink} to={to} sx={{height: '100%'}} data-testid={testId}>
        <CardContent>
          <Stack direction="row" sx={{alignItems: 'center', gap: 2}}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
              }}
            >
              {icon}
            </Box>
            <Box sx={{flexGrow: 1}}>
              <Typography variant="body2" color="text.secondary">
                {title}
              </Typography>
              <Typography variant="h5">{count ?? <Skeleton width={40} />}</Typography>
              <Typography variant="caption" color="text.secondary">
                {caption}
              </Typography>
            </Box>
            <ArrowForwardIcon color="action" />
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function Home() {
  const {t, i18n} = useTranslation('home');
  const {t: tCommon} = useTranslation();
  const {user} = useAuth();
  const {location, can} = useSelectedLocation();
  const firstName = user?.displayName.split(' ')[0] ?? '';

  const locationId = location?.id ?? '';
  const partCount = usePartCount(locationId, can('parts.read'));
  const customerCount = useCustomerCount(locationId, can('customers.read'));
  const recent = useRecentCustomers(locationId, can('customers.read'));

  return (
    <Fragment>
      <PageHeader
        title={t('welcome', {name: firstName})}
        subtitle={
          location ? `${user?.dealerName} · ${location.name} · ${formatRole(tCommon, location.role)}` : user?.dealerName
        }
      />
      <Grid container spacing={3}>
        {can('customers.read') && (
          <Grid size={{xs: 12, sm: 6, lg: 4}}>
            <Shortcut
              to="/customers"
              icon={<PeopleIcon />}
              title={t('customersAt', {location: location?.name ?? ''})}
              count={customerCount.data}
              caption={t('customersCaption')}
              testId="home-customers"
            />
          </Grid>
        )}
        {can('parts.read') && (
          <Grid size={{xs: 12, sm: 6, lg: 4}}>
            <Shortcut
              to="/parts"
              icon={<Inventory2Icon />}
              title={t('partsAt', {location: location?.name ?? ''})}
              count={partCount.data}
              caption={t('partsCaption')}
              testId="home-parts"
            />
          </Grid>
        )}
        {can('customers.read') && (
          <Grid size={{xs: 12, lg: 6}}>
            <Paper sx={{p: 3, height: '100%'}} data-testid="recent-customers">
              <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                {t('recentTitle')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{mb: 1}}>
                {t('recentSubtitle', {location: location?.name ?? ''})}
              </Typography>
              {recent.isLoading && <Skeleton variant="rounded" height={160} />}
              {recent.data?.length === 0 && <Typography color="text.secondary">{t('noRecent')}</Typography>}
              <List dense disablePadding>
                {recent.data?.map((customer) => (
                  <ListItemButton
                    key={customer.id}
                    component={RouterLink}
                    to={`/customers/${customer.id}`}
                    sx={{borderRadius: 1}}
                    data-testid="recent-customer"
                  >
                    <ListItemAvatar>
                      <Avatar sx={{width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main'}}>
                        {customer.firstName[0]}
                        {customer.surname[0]}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={`${customer.firstName} ${customer.surname}`}
                      secondary={
                        customer.lastContactDate
                          ? t('lastContact', {date: formatDaysAgo(customer.lastContactDate, i18n.language)})
                          : null
                      }
                      title={
                        customer.lastContactDate ? formatPlainDate(customer.lastContactDate, i18n.language) : undefined
                      }
                    />
                    <CustomerStatusChip status={customer.status} />
                  </ListItemButton>
                ))}
              </List>
            </Paper>
          </Grid>
        )}
        {location && (
          <Grid size={{xs: 12, lg: can('customers.read') ? 6 : 12}}>
            <Paper sx={{p: 3}}>
              <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                {t('permissionsTitle', {location: location.name})}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
                {t('permissionsSubtitle')}
              </Typography>
              <Stack direction="row" sx={{flexWrap: 'wrap', gap: 1}}>
                {location.permissions.map((permission) => (
                  <Chip key={permission} label={permission} size="small" variant="outlined" />
                ))}
              </Stack>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Fragment>
  );
}
