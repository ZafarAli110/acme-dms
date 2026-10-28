import {ApiProperty, ApiPropertyOptional} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** A photo the part already has, kept by this save. */
export class PartPhotoUpdateDto {
  @ApiProperty()
  @IsUUID()
  public id: string;

  @ApiProperty()
  @IsBoolean()
  public isDefault: boolean;
}

/** One new photo, in the same order as the uploaded files. */
export class PartNewPhotoDto {
  @ApiProperty()
  @IsBoolean()
  public isDefault: boolean;
}

/**
 * PATCH: send only what changes; a field left out keeps its value. Sent as the `payload` field of a multipart request,
 * with the new photos as `photos` files, so the part and its photos are saved together. The part number is the
 * catalogue key and cannot change.
 *
 * - `photos`: when sent, the complete list of existing photos to keep; a photo left out is removed.
 * - `newPhotos`: one entry per uploaded file, in order.
 * - When the part has photos after the save, exactly one of them is the default.
 */
export class PartUpdateRequestDto {
  @ApiPropertyOptional({example: 'Front brake pads, ceramic'})
  @ValidateIf((_request, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  public description?: string;

  @ApiPropertyOptional({example: 49.99})
  @ValidateIf((_request, value) => value !== undefined)
  @IsNumber({maxDecimalPlaces: 2})
  @Min(0)
  public unitPrice?: number;

  @ApiPropertyOptional({type: [PartPhotoUpdateDto]})
  @ValidateIf((_request, value) => value !== undefined)
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => PartPhotoUpdateDto)
  public photos?: PartPhotoUpdateDto[];

  @ApiPropertyOptional({type: [PartNewPhotoDto]})
  @ValidateIf((_request, value) => value !== undefined)
  @IsArray()
  @ValidateNested({each: true})
  @Type(() => PartNewPhotoDto)
  public newPhotos?: PartNewPhotoDto[];
}
