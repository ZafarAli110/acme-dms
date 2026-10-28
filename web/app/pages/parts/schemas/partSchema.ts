import type {TFunction} from 'i18next';
import * as v from 'valibot';
import {PART_PHOTO_RULES} from '../constants/partPhotoRules';
import type {PartFormValues} from '../types/part';

const DESCRIPTION_MAX = 500;
const PRICE = /^\d+(\.\d{1,2})?$/;
const MAX_MB = PART_PHOTO_RULES.maxBytes / 1024 / 1024;

/**
 * The part edit form's rules: the service's rules, checked before anything is sent. A factory, because the messages
 * are translated (IDS pattern); call it once per language with useMemo.
 */
export function createPartUpdateSchema(t: TFunction<'parts'>) {
  const photo = v.object({
    key: v.string(),
    photoId: v.nullable(v.string()),
    documentId: v.nullable(v.string()),
    file: v.nullable(
      v.pipe(
        v.instance(File),
        v.check(
          (file) => (PART_PHOTO_RULES.types as readonly string[]).includes(file.type),
          (issue) => t('edit.validation.photoType', {name: (issue.input as File).name}),
        ),
        v.check(
          (file) => file.size <= PART_PHOTO_RULES.maxBytes,
          (issue) => t('edit.validation.photoSize', {name: (issue.input as File).name, maxMb: MAX_MB}),
        ),
      ),
    ),
    fileName: v.string(),
    isDefault: v.boolean(),
  });

  return v.object({
    description: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(t('edit.validation.descriptionRequired')),
      v.maxLength(DESCRIPTION_MAX, t('edit.validation.descriptionTooLong', {max: DESCRIPTION_MAX})),
    ),
    unitPrice: v.pipe(
      v.string(),
      v.trim(),
      v.nonEmpty(t('edit.validation.priceRequired')),
      v.regex(PRICE, t('edit.validation.priceInvalid')),
    ),
    photos: v.pipe(
      v.array(photo),
      v.maxLength(PART_PHOTO_RULES.maxPerPart, t('edit.validation.tooManyPhotos', {max: PART_PHOTO_RULES.maxPerPart})),
      v.check(
        (photos) => photos.length === 0 || photos.filter((item) => item.isDefault).length === 1,
        t('edit.validation.oneDefault'),
      ),
    ),
  }) satisfies v.GenericSchema<PartFormValues, unknown>;
}
