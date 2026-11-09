import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CERTIFICATE_FILE,
  checkCertificate,
  KEY_FILE,
  NO_DOTNET_MESSAGE,
  type RunDotnet,
  untrustedMessage,
} from "./check-certificate";

/** A stand-in for `dotnet`: the trust check answers `checkExit`; an export writes the two files `dotnet` writes. */
function fakeDotnet(checkExit: number | null, exportExit = 0): { run: RunDotnet; calls: string[][] } {
  const calls: string[][] = [];
  const run: RunDotnet = (args) => {
    calls.push(args);
    if (args.includes("--check")) {
      return checkExit;
    }
    const path = args[args.indexOf("--export-path") + 1]!;
    if (exportExit === 0) {
      writeFileSync(path, "-----BEGIN CERTIFICATE-----");
      writeFileSync(path.replace(/\.pem$/, ".key"), "-----BEGIN PRIVATE KEY-----");
    }
    return exportExit;
  };
  return { run, calls };
}

describe("check-certificate", () => {
  it("writes the trusted certificate and its key for the web server, the key readable by its owner only", () => {
    const root = mkdtempSync(join(tmpdir(), "acme-cert-"));
    const dotnet = fakeDotnet(0);

    expect(checkCertificate(dotnet.run, "darwin", root)).toEqual({ trusted: true });

    expect(existsSync(join(root, CERTIFICATE_FILE))).toBe(true);
    expect(existsSync(join(root, KEY_FILE))).toBe(true);
    if (process.platform !== "win32") {
      expect(statSync(join(root, KEY_FILE)).mode & 0o777).toBe(0o600);
    }
    expect(dotnet.calls[1]).toEqual([
      "dev-certs",
      "https",
      "--export-path",
      join(root, CERTIFICATE_FILE),
      "--format",
      "Pem",
      "--no-password",
    ]);
  });

  it("stops with the one command to run when the certificate is not trusted, and writes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "acme-cert-"));
    const dotnet = fakeDotnet(6);

    const result = checkCertificate(dotnet.run, "win32", root);

    expect(result.trusted).toBe(false);
    expect(result.trusted ? "" : result.message).toContain("dotnet dev-certs https --trust");
    expect(dotnet.calls).toHaveLength(1);
    expect(existsSync(join(root, ".certs"))).toBe(false);
  });

  it("says the .NET SDK is missing when dotnet itself is not found, not to run a dotnet command", () => {
    const root = mkdtempSync(join(tmpdir(), "acme-cert-"));

    const result = checkCertificate(fakeDotnet(null).run, "darwin", root);

    expect(result).toEqual({ trusted: false, message: NO_DOTNET_MESSAGE });
    expect(NO_DOTNET_MESSAGE).not.toContain("dotnet dev-certs");
    expect(existsSync(join(root, ".certs"))).toBe(false);
  });

  it("says a written certificate failed apart from an untrusted one", () => {
    const result = checkCertificate(fakeDotnet(0, 1).run, "darwin", mkdtempSync(join(tmpdir(), "acme-cert-")));

    expect(result.trusted ? "" : result.message).toContain("could not be written");
  });

  it("tells Windows and Mac what the trust command will ask", () => {
    expect(untrustedMessage("win32")).toContain("Windows asks you to confirm");
    expect(untrustedMessage("darwin")).toContain("macOS asks for your password");
    expect(untrustedMessage("linux")).toContain("aka.ms/dev-certs-trust");
  });
});
