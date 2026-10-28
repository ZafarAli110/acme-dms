import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartPhotoResponseDto} from '#dto/parts/part-photo-response.dto';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';

export interface IUploadPartPhotoCommandHandler {
  executeAsync(
    userContext: UserContext,
    partId: string,
    request: PartPhotoUploadRequestDto,
  ): Promise<PartPhotoResponseDto>;
}

export const UPLOAD_PART_PHOTO_COMMAND_HANDLER = Symbol('IUploadPartPhotoCommandHandler');
