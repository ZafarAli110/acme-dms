import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
  type PipeTransform,
  type Type,
} from '@nestjs/common';
import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';

/**
 * A multipart request carries its JSON body as a text field (`payload`) next to the files. This parses that field and
 * validates it like the global ValidationPipe validates a JSON body: the same DTO rules, and unknown properties refused.
 */
export class JsonPayloadPipe<T extends object> implements PipeTransform<unknown, Promise<T>> {
  private readonly _dtoType: Type<T>;

  public constructor(dtoType: Type<T>) {
    this._dtoType = dtoType;
  }

  public async transform(value: unknown): Promise<T> {
    if (typeof value !== 'string') {
      throw new BadRequestException('Send the changes as the JSON multipart field "payload".');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException('The "payload" field is not valid JSON.');
    }
    const dto = plainToInstance(this._dtoType, parsed);
    const errors = await validate(dto, {whitelist: true, forbidNonWhitelisted: true});
    if (errors.length > 0) {
      throw new BadRequestException(errors.flatMap((error) => flattenMessages(error)));
    }
    return dto;
  }
}

function flattenMessages(error: {
  property: string;
  constraints?: Record<string, string>;
  children?: unknown[];
}): string[] {
  const own = Object.values(error.constraints ?? {});
  const nested = (error.children ?? []).flatMap((child) =>
    flattenMessages(child as {property: string; constraints?: Record<string, string>; children?: unknown[]}),
  );
  return [...own, ...nested];
}

const multipartField = createParamDecorator((field: string, context: ExecutionContext): unknown => {
  const request = context.switchToHttp().getRequest<{body?: Record<string, unknown>}>();
  return request.body?.[field];
});

/**
 * The JSON `payload` field of a multipart request, parsed and validated as `dtoType`. A custom parameter decorator,
 * because the global ValidationPipe would otherwise try to validate the raw string as the DTO before this pipe runs.
 */
export function JsonPayload<T extends object>(dtoType: Type<T>): ParameterDecorator {
  return multipartField('payload', new JsonPayloadPipe(dtoType));
}
