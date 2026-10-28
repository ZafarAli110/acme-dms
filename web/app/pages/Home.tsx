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
import {useQuery} from '@tanstack/react-query';
import type {ReactElement} from 'react';
import {useTranslation} from 'react-i18next';
import {Link as RouterLink} from 'react-router';
import {customerQueries} from './customers/queries/customerQueries';
import {partQueries} from './parts/queries/partQueries';
import {useAuth} from '../core/contexts/auth/useAuth';
import {useSelectedLocation} from '../core/contexts/location/useSelectedLocation';
import {formatDaysAgo, formatPlainDate} from '../core/formatters/formatDate';
import {formatRole} from '../core/formatters/formatRole';
import {PageHeader} from '../components/PageHeader';
import {CustomerStatusChip} from './customers/components/CustomerStatusChip';

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

  // Location-scoped: the keys carry the location so a switch never shows the previous location's numbers.
  const parts = useQuery({
    queryKey: ['parts', location?.id, 'count'],
    queryFn: ({signal}) => partQueries.getPartsAsync('', 1, 1, {signal}),
    enabled: location !== null && can('parts.read'),
  });
  const customers = useQuery({
    queryKey: ['customers', location?.id, 'count'],
    queryFn: ({signal}) => customerQueries.getCustomersAsync('', 1, 1, {signal}),
    enabled: location !== null && can('customers.read'),
  });
  const recent = useQuery({
    queryKey: ['customers', location?.id, 'recent'],
    queryFn: ({signal}) => customerQueries.getRecentCustomersAsync({signal}),
    enabled: location !== null && can('customers.read'),
  });

  return (
    <>
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
              count={customers.data?.total}
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
              count={parts.data?.total}
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
    </>
  );
}
