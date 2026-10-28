import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
  Avatar,
  Box,
  Button,
  InputAdornment,
  LinearProgress,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {Fragment} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientLoaderFunctionArgs, Link as RouterLink, useNavigate, useNavigation} from 'react-router';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {formatPlainDate} from '../../core/formatters/formatDate';
import {useListParams} from '../../core/hooks/useListParams';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {PAGE_SIZES, readListParams} from '../../core/paging/listParams';
import {queryClient} from '../../core/queries/queryClient';
import {CustomerStatusChip} from './components/CustomerStatusChip';
import {useCustomerList} from './hooks/useCustomerList';
import {customerQueries} from './queries/customerQueries';
import {CUSTOMER_QUERY_KEYS} from './queries/customerQueryKey';

/** Fetches the page of customers the URL asks for (`?search=&page=&pageSize=`) before the list shows it. */
export async function clientLoader({request, context}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    const {search, page, pageSize} = readListParams(new URL(request.url).searchParams);
    await queryClient
      .query({
        staleTime: 'static',
        queryKey: CUSTOMER_QUERY_KEYS.list(resolved.locationId, search, page, pageSize),
        queryFn: ({signal}) => customerQueries.getCustomersAsync(search, page, pageSize, {signal}),
      })
      .catch(() => null);
  }
  return null;
}

export default function CustomerList() {
  const {t, i18n} = useTranslation('customers');
  const {t: tCommon} = useTranslation();
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const {params, setSearch, setPage, setPageSize} = useListParams();
  const {search, page, pageSize} = params;
  // A new search or page loads in the route's clientLoader; meanwhile the list stays and a bar shows it is loading.
  const isLoadingPage = useNavigation().state === 'loading';
  const {data, error, isLoading} = useCustomerList(location?.id ?? '', params);

  return (
    <Fragment>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {location: location?.name ?? ''})}
        actions={
          can('customers.write') && (
            <Button
              component={RouterLink}
              to="/customers/new"
              variant="contained"
              startIcon={<AddIcon />}
              data-testid="create-customer"
            >
              {t('newCustomer')}
            </Button>
          )
        }
      />
      <ErrorAlert error={error} />
      <Paper>
        <TextField
          size="small"
          placeholder={t('search')}
          // Uncontrolled: the box keeps what is typed while the URL, and then the list, catch up.
          defaultValue={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{m: 2, width: {xs: 'calc(100% - 32px)', sm: 380}}}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          data-testid="customers-search"
        />
        <LinearProgress sx={{visibility: isLoadingPage ? 'visible' : 'hidden'}} />
        <TableContainer>
          <Table size="small" data-testid="customers-table">
            <TableHead>
              <TableRow>
                <TableCell>{t('columns.name')}</TableCell>
                <TableCell>{t('columns.contact')}</TableCell>
                <TableCell>{t('columns.city')}</TableCell>
                <TableCell>{t('columns.status')}</TableCell>
                <TableCell>{t('columns.lastContact')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                Array.from({length: 5}, (_unused, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={5}>
                      <Skeleton height={40} />
                    </TableCell>
                  </TableRow>
                ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} sx={{py: 6, textAlign: 'center'}}>
                    <Typography color="text.secondary">
                      {search ? t('noMatch', {search}) : t('none', {location: location?.name ?? ''})}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((customer) => (
                <TableRow
                  key={customer.id}
                  hover
                  sx={{cursor: 'pointer'}}
                  onClick={() => navigate(`/customers/${customer.id}`)}
                  data-testid="customer-row"
                >
                  <TableCell>
                    <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                      <Avatar sx={{width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main'}}>
                        {customer.firstName[0]}
                        {customer.surname[0]}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{fontWeight: 600}}>
                          {customer.firstName} {customer.surname}
                        </Typography>
                        {customer.companyName && (
                          <Typography variant="caption" color="text.secondary">
                            {customer.companyName}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{customer.email ?? '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {customer.phone ?? ''}
                    </Typography>
                  </TableCell>
                  <TableCell>{customer.city ?? '—'}</TableCell>
                  <TableCell>
                    <CustomerStatusChip status={customer.status} />
                  </TableCell>
                  <TableCell>
                    {customer.lastContactDate ? formatPlainDate(customer.lastContactDate, i18n.language) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={data?.total ?? 0}
          page={page - 1}
          rowsPerPage={pageSize}
          rowsPerPageOptions={PAGE_SIZES}
          labelRowsPerPage={tCommon('pagination.rowsPerPage')}
          labelDisplayedRows={({from, to, count}) => tCommon('pagination.displayed', {from, to, count})}
          onPageChange={(_event, next) => setPage(next + 1)}
          onRowsPerPageChange={(event) => setPageSize(Number(event.target.value))}
        />
      </Paper>
    </Fragment>
  );
}
