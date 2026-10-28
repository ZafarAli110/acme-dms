export interface PartPhotoResponseDto {
  id: string;
  documentId: string;
  originalFileName: string;
  status: 'pending' | 'ready' | 'failed';
  failureReason: string | null;
  isDefault: boolean;
  createdAt: string;
}
