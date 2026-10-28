import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import {ApiBody, ApiConsumes} from '@nestjs/swagger';
import type {UserContext} from '#business-logic-abstractions/user-context/user-context';
import {
  CREATE_PART_COMMAND_HANDLER,
  type ICreatePartCommandHandler,
} from '#business-logic-abstractions/handlers/parts/create/create-part.command-handler.interface';
import {
  type IUpdatePartCommandHandler,
  UPDATE_PART_COMMAND_HANDLER,
} from '#business-logic-abstractions/handlers/parts/update/update-part.command-handler.interface';
import {
  type IUploadPartPhotoCommandHandler,
  UPLOAD_PART_PHOTO_COMMAND_HANDLER,
} from '#business-logic-abstractions/handlers/parts/upload-photo/upload-part-photo.command-handler.interface';
import {PartCreateRequestDto} from '#dto/parts/part-create-request.dto';
import type {PartPhotoResponseDto} from '#dto/parts/part-photo-response.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import {PartUpdateRequestDto} from '#dto/parts/part-update-request.dto';
import {CurrentUser} from '../../authorization/current-user.decorator';
import {RequirePermission} from '../../authorization/require-permission.decorator';
import {
  MultipleFilesUpload,
  SingleFileUpload,
  type UploadedFileLike,
  uploadedFileName,
} from '../../interceptors/file-upload.interceptor';
import {JsonPayload} from '../../pipes/json-payload.pipe';

/** Transport guardrails only; the photo rules (10 MB, image types, 10 per part) are enforced by the handlers. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;

/** Changes to the parts catalogue. Reads are in PartController. */
@Controller('v1/parts')
export class PartCommandController {
  private readonly _createPartCommandHandler: ICreatePartCommandHandler;
  private readonly _updatePartCommandHandler: IUpdatePartCommandHandler;
  private readonly _uploadPartPhotoCommandHandler: IUploadPartPhotoCommandHandler;

  public constructor(
    @Inject(CREATE_PART_COMMAND_HANDLER) createPartCommandHandler: ICreatePartCommandHandler,
    @Inject(UPDATE_PART_COMMAND_HANDLER) updatePartCommandHandler: IUpdatePartCommandHandler,
    @Inject(UPLOAD_PART_PHOTO_COMMAND_HANDLER) uploadPartPhotoCommandHandler: IUploadPartPhotoCommandHandler,
  ) {
    this._createPartCommandHandler = createPartCommandHandler;
    this._updatePartCommandHandler = updatePartCommandHandler;
    this._uploadPartPhotoCommandHandler = uploadPartPhotoCommandHandler;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('parts.write')
  public createAsync(
    @CurrentUser() userContext: UserContext,
    @Body() request: PartCreateRequestDto,
  ): Promise<PartResponseDto> {
    return this._createPartCommandHandler.executeAsync(userContext, request);
  }

  /**
   * One Save of the part page: the changed fields and the photo changes, as multipart: a JSON `payload` field
   * (PartUpdateRequestDto) and the new photos as `photos` files. The part and its photos are saved together or not
   * at all.
   */
  @Patch(':partId')
  @RequirePermission('parts.write')
  @UseInterceptors(MultipleFilesUpload('photos', MAX_UPLOAD_FILES, MAX_UPLOAD_BYTES))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        payload: {type: 'string', description: 'PartUpdateRequestDto as JSON'},
        photos: {type: 'array', items: {type: 'string', format: 'binary'}},
      },
    },
  })
  public updateAsync(
    @CurrentUser() userContext: UserContext,
    @Param('partId', ParseUUIDPipe) partId: string,
    @JsonPayload(PartUpdateRequestDto) request: PartUpdateRequestDto,
    @UploadedFiles() files: UploadedFileLike[] | undefined,
  ): Promise<PartResponseDto> {
    return this._updatePartCommandHandler.executeAsync(
      userContext,
      partId,
      request,
      (files ?? []).map((file) => ({
        fileName: uploadedFileName(file),
        contentType: file.mimetype,
        sizeBytes: file.size,
        content: new Uint8Array(file.buffer),
      })),
    );
  }

  /** 202: the photo is stored and queued for processing; its status turns "ready" or "failed" shortly after. */
  @Post(':partId/photos')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('documents.write')
  @UseInterceptors(SingleFileUpload('file', MAX_UPLOAD_BYTES))
  @ApiConsumes('multipart/form-data')
  @ApiBody({schema: {type: 'object', properties: {file: {type: 'string', format: 'binary'}}}})
  public uploadPhotoAsync(
    @CurrentUser() userContext: UserContext,
    @Param('partId', ParseUUIDPipe) partId: string,
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<PartPhotoResponseDto> {
    if (!file) {
      throw new BadRequestException('Send the photo as multipart form field "file".');
    }
    return this._uploadPartPhotoCommandHandler.executeAsync(userContext, partId, {
      fileName: uploadedFileName(file),
      contentType: file.mimetype,
      sizeBytes: file.size,
      content: new Uint8Array(file.buffer),
    });
  }
}
