import { describe, expect, it } from "vitest";
import { isValidDownloadLink, signedDownloadPath } from "../download-link";

describe("download links", () => {
  const key = "a-key-every-api-instance-shares-0123456789";
  const expires = 2_000_000_000_000;
  const signatureOf = (path: string): string => new URL(path, "http://api.test/").searchParams.get("signature")!;

  it("are accepted by any instance with the shared key, after a restart too", () => {
    const signature = signatureOf(signedDownloadPath(key, "job-1", expires));

    expect(isValidDownloadLink(key, "job-1", String(expires), signature, expires - 1)).toBe(true);
  });

  it("are refused with another key, for another job, or once they have run out", () => {
    const signature = signatureOf(signedDownloadPath(key, "job-1", expires));

    expect(isValidDownloadLink(`${key}-other`, "job-1", String(expires), signature, expires - 1)).toBe(false);
    expect(isValidDownloadLink(key, "job-2", String(expires), signature, expires - 1)).toBe(false);
    expect(isValidDownloadLink(key, "job-1", String(expires), signature, expires + 1)).toBe(false);
  });
});
