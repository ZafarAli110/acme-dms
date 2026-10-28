import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import {
  Avatar,
  Button,
  Chip,
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
import {Fragment, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {type ClientLoaderFunctionArgs, useNavigate, useNavigation} from 'react-router';
import {DocumentImage} from '../../components/DocumentImage';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {useListParams} from '../../core/hooks/useListParams';
import {RESOLVED_LOCATION_CONTEXT} from '../../core/middleware/routerContext';
import {PAGE_SIZES, readListParams} from '../../core/paging/listParams';
import {queryClient} from '../../core/queries/queryClient';
import {formatPrice} from './formatters/formatPrice';
import {usePartList} from './hooks/usePartList';
import {PartCreateDialog} from './PartCreateDialog';
import {partQueryOptions} from './queries/partQueryOptions';

/** Fetches the page of parts the URL asks for (`?search=&page=&pageSize=`) before the list shows it. */
export async function clientLoader({request, context}: ClientLoaderFunctionArgs) {
  const resolved = context.get(RESOLVED_LOCATION_CONTEXT);
  if (resolved) {
    const params = readListParams(new URL(request.url).searchParams);
    await queryClient
      .query({...partQueryOptions.list(resolved.locationId, params), staleTime: 'static'})
      .catch(() => null);
  }
  return null;
}

export default function PartList() {
  const {t, i18n} = useTranslation('parts');
  const {t: tCommon} = useTranslation();
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const {params, setSearch, setPage, setPageSize} = useListParams();
  const {search, page, pageSize} = params;
  // A new search or page loads in the route's clientLoader; meanwhile the list stays and a bar shows it is loading.
  const isLoadingPage = useNavigation().state === 'loading';
  const {data, error, isLoading} = usePartList(location?.id ?? '', params);
  // Creating a part opens PartCreateDialog, which predates the web standard: its own form state, not a route.
  const [creating, setCreating] = useState(false);

  return (
    <Fragment>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle', {location: location?.name ?? ''})}
        actions={
          can('parts.write') && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreating(true)}
              data-testid="create-part"
            >
              {t('newPart')}
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
          data-testid="parts-search"
        />
        <LinearProgress sx={{visibility: isLoadingPage ? 'visible' : 'hidden'}} />
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={72} />
                <TableCell>{t('columns.partNumber')}</TableCell>
                <TableCell>{t('columns.description')}</TableCell>
                <TableCell>{t('columns.bin')}</TableCell>
                <TableCell align="right">{t('columns.onHand')}</TableCell>
                <TableCell align="right">{t('columns.unitPrice')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading &&
                Array.from({length: 5}, (_unused, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={6}>
                      <Skeleton height={40} />
                    </TableCell>
                  </TableRow>
                ))}
              {data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{py: 6, textAlign: 'center'}}>
                    <Typography color="text.secondary">
                      {search ? t('noMatch', {search}) : t('noneStocked', {location: location?.name ?? ''})}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {data?.items.map((part) => (
                <TableRow
                  key={part.id}
                  hover
                  sx={{cursor: 'pointer'}}
                  onClick={() => navigate(`/parts/${part.id}`)}
                  data-testid="part-row"
                >
                  <TableCell sx={{py: 1}}>
                    {part.thumbnailDocumentId ? (
                      <DocumentImage documentId={part.thumbnailDocumentId} variant="thumb" size={44} />
                    ) : (
                      <Avatar variant="rounded" sx={{width: 44, height: 44, bgcolor: 'action.hover'}}>
                        <ImageIcon color="disabled" />
                      </Avatar>
                    )}
                  </TableCell>
                  <TableCell sx={{fontFamily: 'monospace', fontWeight: 600}}>{part.partNumber}</TableCell>
                  <TableCell>{part.description}</TableCell>
                  <TableCell sx={{fontFamily: 'monospace'}}>{part.inventory.binCode}</TableCell>
                  <TableCell align="right">
                    {part.inventory.belowReorderLevel && (
                      <Chip size="small" color="warning" label={t('low')} sx={{mr: 1}} data-testid="low-stock" />
                    )}
                    {part.inventory.quantityOnHand}
                  </TableCell>
                  <TableCell align="right">{formatPrice(part.unitPrice, i18n.language)}</TableCell>
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
      <PartCreateDialog open={creating} onClose={() => setCreating(false)} />
    </Fragment>
  );
}
