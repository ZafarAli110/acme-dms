import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = resolve(import.meta.dirname, "../..");
const HANDLER_INTERFACES = join(SOURCE, "business-logic-abstractions/handlers");
const HANDLERS = join(SOURCE, "business-logic/handlers");

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.includes("__test__"))
    .map((file) => join(folder, file));
}

/** Every handler interface by name, e.g. `IGetCustomerQueryHandler`. */
function handlerInterfaceNames(): string[] {
  const names: string[] = [];
  for (const file of sourceFiles(HANDLER_INTERFACES)) {
    for (const match of readFileSync(file, "utf8").matchAll(/export interface (I\w+Handler)\b/g)) {
      const name = match[1];
      if (name) {
        names.push(name);
      }
    }
  }
  return names;
}

describe("business-logic-abstractions/handlers", () => {
  it("has a handler in business-logic/handlers for every interface", () => {
    const names = handlerInterfaceNames();
    const handlers = sourceFiles(HANDLERS)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const unimplemented = names.filter((name) => !new RegExp(`implements\\s+${name}\\b`).test(handlers));

    expect(names.length).toBeGreaterThan(0);
    expect(unimplemented).toEqual([]);
  });
});
