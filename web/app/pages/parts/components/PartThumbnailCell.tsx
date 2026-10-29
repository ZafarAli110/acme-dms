import ImageIcon from '@mui/icons-material/Image';
import {Avatar, Box} from '@mui/material';
import {DocumentImage} from '../../../components/DocumentImage';
import type {PartListItem} from '../types/part';

/** The part's default photo in a grid row, or a placeholder when it has none. */
export function PartThumbnailCell({part}: {part: PartListItem}) {
  return (
    <Box sx={{display: 'flex', alignItems: 'center', height: '100%'}}>
      {part.thumbnailDocumentId ? (
        <DocumentImage documentId={part.thumbnailDocumentId} variant="thumb" size={32} />
      ) : (
        <Avatar variant="rounded" sx={{width: 32, height: 32, bgcolor: 'action.hover'}}>
          <ImageIcon fontSize="small" color="disabled" />
        </Avatar>
      )}
    </Box>
  );
}
