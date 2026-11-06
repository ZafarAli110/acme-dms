import { describe, expect, it } from "vitest";
import { RequestTimeoutError, ServerUnreachableError } from "../../config/apiErrors";
import { prefetchListPage, withoutPage } from "../prefetchListPage";

const request = (query: string) => new Request(`http://app/customers${query}`);

describe("withoutPage", () => {
  it("keeps the search, sort and filter, and drops only the page", () => {
    expect(withoutPage("http://app/customers?search=ada&page=3&sort=surname&direction=desc")).toBe(
      "/customers?search=ada&sort=surname&direction=desc",
    );
    expect(withoutPage("http://app/customers?page=2")).toBe("/customers");
  });
});

describe("prefetchListPage", () => {
  it("fetches the page the URL asks for", async () => {
    const asked: number[] = [];

    await prefetchListPage(request("?page=2&pageSize=50"), async (params) => {
      asked.push(params.page, params.pageSize);
    });

    expect(asked).toEqual([2, 50]);
  });

  it("sends page 2 or later to page 1 when the service cannot be reached or is too slow", async () => {
    for (const error of [new ServerUnreachableError(), new RequestTimeoutError()]) {
      const thrown = await prefetchListPage(request("?search=ada&page=4"), () => Promise.reject(error)).catch(
        (caught: unknown) => caught,
      );

      expect(thrown).toBeInstanceOf(Response);
      expect((thrown as Response).status).toBe(302);
      expect((thrown as Response).headers.get("location")).toBe("/customers?search=ada");
    }
  });

  it("leaves page 1 and every other failure to the page's own query", async () => {
    await expect(prefetchListPage(request(""), () => Promise.reject(new ServerUnreachableError()))).resolves.toBeNull();
    await expect(prefetchListPage(request("?page=2"), () => Promise.reject(new Error("a 400")))).resolves.toBeNull();
  });
});
