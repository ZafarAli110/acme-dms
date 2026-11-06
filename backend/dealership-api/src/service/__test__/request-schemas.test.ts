import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { BinCreateRequestSchema } from "#dto/bins/bin-create-request.dto";
import { ExportRequestSchema } from "#dto/exports/export-request.dto";
import { ListQuerySchema } from "#dto/paging/list-query.dto";
import { PartCreateRequestSchema } from "#dto/parts/part-create-request.dto";
import { PartUpdateRequestSchema } from "#dto/parts/part-update-request.dto";
import { StockLevelSetRequestSchema } from "#dto/stock/stock-level-set-request.dto";
import { CustomerRequestSchema } from "#dto/customers/customer-request.schema";
import { englishMessage } from "#i18n/messages";
import { valibotToOpenApi } from "../swagger/valibot-openapi";
import { toValidationMessage, type ValibotIssue } from "../validation/valibot-pipe";

/** The parts of a Valibot schema or rule the walk above reads. */
interface SchemaNode {
  type: string;
  kind?: string;
  wrapped?: SchemaNode;
  item?: SchemaNode;
  pipe?: SchemaNode[];
  entries?: Record<string, SchemaNode>;
  options?: unknown;
}

/** The English messages a schema gives for a request, as the problem-details filter would answer them. */
function problems(schema: v.GenericSchema, input: unknown): string[] {
  const result = v.safeParse(schema, input);
  return result.success
    ? []
    : result.issues.map((issue) => {
        const { key, args } = toValidationMessage(issue as ValibotIssue);
        return englishMessage(key, args);
      });
}

const UUID = "30000000-0000-0000-0000-0000000000aa";
const PART = {
  partNumber: "BRK-1",
  description: "Pads",
  unitPrice: 49.99,
  binId: UUID,
  quantityOnHand: 6,
  reorderLevel: 4,
};

describe("request schemas", () => {
  it("read a list query's numbers from a query string and from a JSON body, and leave out what is not sent", () => {
    expect(v.parse(ListQuerySchema, { page: "2", pageSize: "50", search: "brake" })).toEqual({
      page: 2,
      pageSize: 50,
      search: "brake",
    });
    expect(v.parse(ExportRequestSchema, { page: 2, columns: [{ field: "name" }], sort: null })).toMatchObject({
      page: 2,
      sort: undefined,
    });
  });

  it("refuse a bad list query in the service's words", () => {
    expect(problems(ListQuerySchema, { page: "0" })).toEqual(["Page must be at least 1."]);
    expect(problems(ListQuerySchema, { pageSize: "101" })).toEqual(["Page size must be at most 100."]);
    expect(problems(ListQuerySchema, { page: "abc" })).toEqual(["Page must be a number."]);
    expect(problems(ListQuerySchema, { page: "1.5" })).toEqual(["Page must be a whole number."]);
    expect(problems(ListQuerySchema, { direction: "up" })).toEqual(["Direction must be one of: asc, desc."]);
    expect(problems(ListQuerySchema, { filterOperator: "like" })[0]).toMatch(/^Filter must be one of: contains,/);
    expect(problems(ListQuerySchema, { sort: "x".repeat(51) })).toEqual(["Sort must be at most 50 characters."]);
    expect(problems(ListQuerySchema, { other: "1" })).toEqual(["other is not a field of this request."]);
  });

  it("refuse an export without columns, with too many, or with an empty heading", () => {
    expect(problems(ExportRequestSchema, { columns: [] })).toEqual(["Columns must have at least 1 items."]);
    expect(problems(ExportRequestSchema, { columns: Array.from({ length: 31 }, () => ({ field: "a" })) })).toEqual([
      "Columns must have at most 30 items.",
    ]);
    expect(problems(ExportRequestSchema, { columns: [{ field: "a", header: "" }] })).toEqual([
      "Heading must be at least 1 characters.",
    ]);
    expect(problems(ExportRequestSchema, {})).toEqual(["Columns is required."]);
  });

  it("refuse a bin or a part that breaks a rule", () => {
    expect(problems(BinCreateRequestSchema, { code: "a-1", description: "x" })).toEqual([
      "Code may only contain capital letters, digits and dashes.",
    ]);
    expect(problems(PartCreateRequestSchema, { ...PART, unitPrice: 1.234 })).toEqual(["Unit price must be a number."]);
    expect(problems(PartCreateRequestSchema, { ...PART, unitPrice: -1 })).toEqual(["Unit price must be at least 0."]);
    expect(problems(PartCreateRequestSchema, { ...PART, binId: "nope" })).toEqual(["Bin must be a valid id."]);
    expect(problems(PartCreateRequestSchema, { ...PART, quantityOnHand: 1.5 })).toEqual([
      "Quantity on hand must be a whole number.",
    ]);
    expect(problems(PartCreateRequestSchema, { ...PART, description: undefined })).toEqual([
      "Description is required.",
    ]);
    expect(problems(PartCreateRequestSchema, { ...PART, unitPrice: "49" })).toEqual(["Unit price must be a number."]);
    expect(problems(StockLevelSetRequestSchema, { binId: UUID, quantityOnHand: -1, reorderLevel: 0 })).toEqual([
      "Quantity on hand must be at least 0.",
    ]);
    expect(v.parse(PartCreateRequestSchema, { ...PART, unitPrice: 0.1 + 0.2 }).unitPrice).toBeCloseTo(0.3);
  });

  it("take a part update with only what changes, and refuse null, a bad photo, or an unknown field", () => {
    expect(v.parse(PartUpdateRequestSchema, {})).toEqual({});
    expect(
      v.parse(PartUpdateRequestSchema, { photos: [{ id: UUID, isDefault: true }], newPhotos: [{ isDefault: false }] }),
    );
    expect(problems(PartUpdateRequestSchema, { description: null })).toEqual(["Description must be text."]);
    expect(problems(PartUpdateRequestSchema, { photos: [{ id: "x", isDefault: true }] })).toEqual([
      "Id must be a valid id.",
    ]);
    expect(problems(PartUpdateRequestSchema, { newPhotos: [{ isDefault: "yes" }] })).toEqual([
      "Default photo must be true or false.",
    ]);
    expect(problems(PartUpdateRequestSchema, { photos: "x" })).toEqual(["Photos must be a list."]);
    expect(problems(PartUpdateRequestSchema, { partNumber: "NEW-1" })).toEqual([
      "Part number is not a field of this request.",
    ]);
  });
});

/** Nothing validates a body or a query that names no schema: the pipe has nothing to check it against. */
describe("controllers", () => {
  it("name a schema for every @Body() and @Query() that carries a whole request", () => {
    const controllers = join(import.meta.dirname, "..", "controllers");
    const files = readdirSync(controllers, { recursive: true, encoding: "utf8" }).filter((file) =>
      file.endsWith(".controller.ts"),
    );
    const unvalidated = files.filter((file) =>
      /@(Body|Query)\(\s*\)/.test(readFileSync(join(controllers, file), "utf8")),
    );

    expect(files.length).toBeGreaterThan(5);
    expect(unvalidated).toEqual([]);
  });
});

/** What Swagger shows for a schema: what a client may send, in OpenAPI's words. */
describe("the OpenAPI schemas", () => {
  const openApi = (schema: v.GenericSchema) =>
    valibotToOpenApi(schema).schema as { properties: Record<string, Record<string, unknown>>; required?: string[] };

  it("say a price has at most two decimals", () => {
    const { properties } = openApi(PartCreateRequestSchema);

    expect(properties["unitPrice"]).toEqual({
      type: "number",
      minimum: 0,
      multipleOf: 0.01,
      description: "In pounds, at most two decimals",
      example: 49.99,
    });
  });

  it("show a field that may be left out as that field, and a page as a number", () => {
    const { properties, required } = openApi(ListQuerySchema);

    expect(properties["page"]).toEqual({ type: "integer", minimum: 1, description: "From 1; the default is 1" });
    expect(properties["pageSize"]).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
    expect(properties["direction"]).toEqual({ enum: ["asc", "desc"], type: "string" });
    expect(properties["search"]).toMatchObject({ type: "string", maxLength: 100 });
    expect(required ?? []).toEqual([]);
  });

  it("still show a value that may be cleared as nullable", () => {
    const { properties, required } = openApi(CustomerRequestSchema);

    expect(properties["companyName"]).toEqual({ anyOf: [{ type: "string", maxLength: 200 }, { type: "null" }] });
    expect(required).toContain("companyName");
  });
});

/** A request schema nobody can convert would break Swagger: every one is converted here, whatever rules it uses. */
describe("every request schema", () => {
  it("has an OpenAPI schema and an English message for each of its rules", async () => {
    const dtoFolder = join(import.meta.dirname, "..", "..", "dto");
    const files = readdirSync(dtoFolder, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
    const names: string[] = [];
    for (const file of files) {
      const exported = (await import(join(dtoFolder, file))) as Record<string, unknown>;
      for (const [name, value] of Object.entries(exported)) {
        if (name.endsWith("Schema")) {
          names.push(name);
          expect(() => valibotToOpenApi(value), name).not.toThrow();
        }
      }
    }

    expect(names.length).toBeGreaterThan(8);
  });

  it("has a validation message for every rule and type of every request schema (an unmapped one would answer a wrong message)", async () => {
    const dtoFolder = join(import.meta.dirname, "..", "..", "dto");
    const files = readdirSync(dtoFolder, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
    const kinds = new Set<string>();
    const walk = (node: SchemaNode): void => {
      // What can refuse a value is a type that checks it, or a rule that does; wrappers hand the value on.
      const checks =
        !["nullable", "optional", "nullish"].includes(node.type) &&
        !["metadata", "transformation"].includes(node.kind ?? "");
      if (checks && node.type !== "object_with_rest") {
        kinds.add(node.type);
      }
      for (const child of [node.wrapped, node.item, ...(node.pipe ?? []), ...Object.values(node.entries ?? {})]) {
        if (child) {
          walk(child);
        }
      }
      if (node.type === "union") {
        (node.options as SchemaNode[]).forEach(walk);
      }
    };
    for (const file of files) {
      for (const [name, value] of Object.entries((await import(join(dtoFolder, file))) as Record<string, unknown>)) {
        if (name.endsWith("Schema")) {
          walk(value as SchemaNode);
        }
      }
    }

    for (const type of kinds) {
      expect(
        () => toValidationMessage({ type, message: "", path: [{ key: "field" }] }),
        `the rule "${type}"`,
      ).not.toThrow();
    }
    expect(kinds.size).toBeGreaterThan(12);
    expect(() => toValidationMessage({ type: "starts_with", message: "" })).toThrow(/rule "starts_with"/);
  });

  it("names a rule it does not know, instead of leaving it out of the document", () => {
    expect(() => valibotToOpenApi(v.pipe(v.string(), v.startsWith("A")))).toThrow(/rule "starts_with"/);
    expect(() => valibotToOpenApi(v.date())).toThrow(/schema "date"/);
  });
});
