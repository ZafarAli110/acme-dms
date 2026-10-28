import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import SearchIcon from '@mui/icons-material/Search';
import {
  Avatar,
  Button,
  Chip,
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
import {useNavigate} from 'react-router';
import {partQueries} from './queries/partQueries';
import {useSelectedLocation} from '../../core/contexts/location/useSelectedLocation';
import {DocumentImage} from '../../components/DocumentImage';
import {ErrorAlert} from '../../components/ErrorAlert';
import {PageHeader} from '../../components/PageHeader';
import {formatPrice} from './formatters/formatPrice';
import {PartCreateDialog} from './PartCreateDialog';

export default function PartList() {
  const {t, i18n} = useTranslation('parts');
  const {t: tCommon} = useTranslation();
  const {location, can} = useSelectedLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [creating, setCreating] = useState(false);

  // Parts are listed as stocked at the selected location, so the location is part of the key.
  const {data, error, isLoading} = useQuery({
    queryKey: ['parts', location?.id, search, page, pageSize],
    queryFn: ({signal}) => partQueries.getPartsAsync(search, page + 1, pageSize, {signal}),
    placeholderData: keepPreviousData,
    enabled: location !== null,
  });

  return (
    <>
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
          data-testid="parts-search"
        />
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
      <PartCreateDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
