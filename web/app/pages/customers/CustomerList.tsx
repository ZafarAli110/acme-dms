import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
  Avatar,
  Box,
  Button,
  InputAdornment,
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
import {keepPreviousData, useQuery} from '@tanstack/react-query';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {formatPlainDate} from '../../core/formatters/formatDate';
import {useNavigate} from 'react-router';
import {customerQueries} from './queries/customerQueries';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {CustomerCreateDialog} from './components/CustomerCreateDialog';
import {CustomerStatusChip} from './components/CustomerStatusChip';

export default function CustomerList() {
  const {t, i18n} = useTranslation('customers');
  const {t: tCommon} = useTranslation();
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);

  // The location is part of the key: customers belong to one location, and another location's list must never show.
  const {data, error, isLoading} = useQuery({
    queryKey: ['customers', location?.id, search, page, pageSize],
    queryFn: ({signal}) => customerQueries.getCustomersAsync(search, page + 1, pageSize, {signal}),
    placeholderData: keepPreviousData,
    enabled: location !== null,
  });

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {location: location?.name ?? ''})}
        actions={
          can('customers.write') && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreating(true)}
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
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
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
          page={page}
          rowsPerPage={pageSize}
          labelRowsPerPage={tCommon('pagination.rowsPerPage')}
          labelDisplayedRows={({from, to, count}) => tCommon('pagination.displayed', {from, to, count})}
          onPageChange={(_event, next) => setPage(next)}
          onRowsPerPageChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(0);
          }}
        />
      </Paper>
      <CustomerCreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
