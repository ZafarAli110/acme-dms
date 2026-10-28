import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import type {PartPhotoUploadRequestDto} from '#dto/parts/part-photo-upload-request.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import type {PartUpdateRequestDto} from '#dto/parts/part-update-request.dto';

export interface IUpdatePartCommandHandler {
  /** `files` are the new photos, in the order of `request.newPhotos`. */
  executeAsync(
    userContext: UserContext,
    partId: string,
    request: PartUpdateRequestDto,
    files: PartPhotoUploadRequestDto[],
  ): Promise<PartResponseDto>;
}

export const UPDATE_PART_COMMAND_HANDLER = Symbol('IUpdatePartCommandHandler');
