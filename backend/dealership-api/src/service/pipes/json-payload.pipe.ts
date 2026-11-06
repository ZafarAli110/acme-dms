import { localized } from "#i18n/messages";
import { BadRequestException, createParamDecorator, type ExecutionContext, type PipeTransform } from "@nestjs/common";
import * as v from "valibot";
import { validationException } from "../validation/valibot-pipe";

/**
 * A multipart request carries its JSON body as a text field (`payload`) next to the files. This parses that field and
 * validates it like the global pipe validates a JSON body: the same schema rules, the same messages, and unknown
 * properties refused (the schema is a `strictObject`).
 */
export class JsonPayloadPipe<TSchema extends v.GenericSchema> implements PipeTransform<
  unknown,
  v.InferOutput<TSchema>
> {
  private readonly _schema: TSchema;

  public constructor(schema: TSchema) {
    this._schema = schema;
  }

  public transform(value: unknown): v.InferOutput<TSchema> {
    if (typeof value !== "string") {
      throw new BadRequestException(localized("errors.payloadMissing"));
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException(localized("errors.payloadNotJson"));
    }
    const result = v.safeParse(this._schema, parsed);
    if (!result.success) {
      throw validationException(result.issues);
    }
    return result.output;
  }
}

const multipartField = createParamDecorator((field: string, context: ExecutionContext): unknown => {
  const request = context.switchToHttp().getRequest<{ body?: Record<string, unknown> }>();
  return request.body?.[field];
});

/**
 * The JSON `payload` field of a multipart request, parsed and validated against `schema`. A custom parameter
 * decorator: the global pipe skips custom parameters, so this pipe is the only one that reads the raw string.
 */
export function JsonPayload<TSchema extends v.GenericSchema>(schema: TSchema): ParameterDecorator {
  return multipartField("payload", new JsonPayloadPipe(schema));
}
