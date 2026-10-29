import {Box, Skeleton} from '@mui/material';
import {useQuery} from '@tanstack/react-query';
import {useObjectUrl} from '../core/hooks/useObjectUrl';
import {documentQueries} from '../core/queries/documentQueries';

/** Images need the bearer token, so they are fetched as blobs and shown through an object URL. */
export function DocumentImage({
  documentId,
  variant,
  size,
}: {
  documentId: string;
  variant: 'thumb' | 'display';
  /** Pixels, or a CSS length such as '100%' to fill the parent. */
  size: number | string;
}) {
  const {data: blob} = useQuery({
    queryKey: ['document-content', documentId, variant],
    queryFn: () => documentQueries.getContentAsync(documentId, variant),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const url = useObjectUrl(blob);

  if (!url) {
    return <Skeleton variant="rectangular" width={size} height={size} />;
  }
  return (
    <Box
      component="img"
      src={url}
      alt=""
      sx={{width: size, height: size, objectFit: 'cover', borderRadius: 1, display: 'block'}}
    />
  );
}
