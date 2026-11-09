import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CERTIFICATE_FILE,
  checkCertificate,
  exportNotice,
  KEY_FILE,
  NO_DOTNET_MESSAGE,
  type RunDotnet,
  untrustedMessage,
} from "./check-certificate";

/** A self-signed certificate made for this test only (CN=acme-check-certificate-test), and its SHA-1 thumbprint. */
const TEST_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIBgzCCASigAwIBAgIUFtJawnnToUkcqZe9BVoWWUd/fG8wCgYIKoZIzj0EAwIw
JjEkMCIGA1UEAwwbYWNtZS1jaGVjay1jZXJ0aWZpY2F0ZS10ZXN0MCAXDTI2MTEw
OTIxMTAxMVoYDzIxMjYxMDE2MjExMDExWjAmMSQwIgYDVQQDDBthY21lLWNoZWNr
LWNlcnRpZmljYXRlLXRlc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARLaoYJ
eLgVhmhGtd/HCAeldfheSQYlMSKAHL6SjTjOlspfrer7TqNctVUsGIg1T0WmfsIh
AVjWigwi1TtRvnnWozIwMDAdBgNVHQ4EFgQULQ6Vsi9yzH5i6Pn/jdfBnDBVOuAw
DwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNJADBGAiEAu5NzRL/PC+6HlSt1
P9ciXX+NJBwZgr+Wme+6DKVtvQwCIQDA8Jh/CXCtoY3/Yx/buKx52FvYS8gS2smd
LAjvuzsYeQ==
-----END CERTIFICATE-----`;
const TEST_THUMBPRINT = "CE0E8FEDCA98DC42A2E58E5203D29E134BF457DA";
const TRUSTED = `A trusted certificate was found: ${TEST_THUMBPRINT} - CN=localhost - IsHttpsDevelopmentCertificate: true`;

/**
 * A stand-in for `dotnet`: the trust check answers `checkExit` (null: no `dotnet` at all) and names the test
 * certificate; an export writes the two files `dotnet` writes.
 */
function fakeDotnet(checkExit: number | null, exportExit = 0): { run: RunDotnet; calls: string[][] } {
  const calls: string[][] = [];
  const run: RunDotnet = (args) => {
    calls.push(args);
    if (checkExit === null) {
      return null;
    }
    if (args.includes("--check")) {
      return { exitCode: checkExit, output: checkExit === 0 ? TRUSTED : "No valid certificate found." };
    }
    const path = args[args.indexOf("--export-path") + 1]!;
    if (exportExit === 0) {
      writeFileSync(path, TEST_CERTIFICATE);
      writeFileSync(path.replace(/\.pem$/, ".key"), "-----BEGIN PRIVATE KEY-----");
    }
    return { exitCode: exportExit, output: "" };
  };
  return { run, calls };
}

const newRoot = (): string => mkdtempSync(join(tmpdir(), "acme-cert-"));

describe("check-certificate", () => {
  it("writes the trusted certificate and its key, the key readable by its owner only, saying so first", () => {
    const root = newRoot();
    const dotnet = fakeDotnet(0);
    const said: string[] = [];

    expect(checkCertificate(dotnet.run, "darwin", root, (line) => said.push(line))).toEqual({ trusted: true });

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
    expect(said).toEqual([exportNotice("darwin")]);
  });

  it("does not export again when .certs/ already holds the trusted certificate: no keychain dialog at every start", () => {
    const root = newRoot();
    mkdirSync(join(root, ".certs"));
    writeFileSync(join(root, CERTIFICATE_FILE), TEST_CERTIFICATE);
    writeFileSync(join(root, KEY_FILE), "-----BEGIN PRIVATE KEY-----");
    const dotnet = fakeDotnet(0);
    const said: string[] = [];

    expect(checkCertificate(dotnet.run, "darwin", root, (line) => said.push(line))).toEqual({ trusted: true });

    expect(dotnet.calls).toHaveLength(1);
    expect(said).toEqual([]);
  });

  it("exports again when the trusted certificate is another one (renewed), or its key is missing", () => {
    const renewed = newRoot();
    mkdirSync(join(renewed, ".certs"));
    writeFileSync(join(renewed, CERTIFICATE_FILE), "an older certificate");
    writeFileSync(join(renewed, KEY_FILE), "-----BEGIN PRIVATE KEY-----");
    const noKey = newRoot();
    mkdirSync(join(noKey, ".certs"));
    writeFileSync(join(noKey, CERTIFICATE_FILE), TEST_CERTIFICATE);

    const first = fakeDotnet(0);
    const second = fakeDotnet(0);
    checkCertificate(first.run, "darwin", renewed);
    checkCertificate(second.run, "darwin", noKey);

    expect(first.calls).toHaveLength(2);
    expect(second.calls).toHaveLength(2);
  });

  it("stops with the one command to run when the certificate is not trusted, and writes nothing", () => {
    const root = newRoot();
    const dotnet = fakeDotnet(6);

    const result = checkCertificate(dotnet.run, "win32", root);

    expect(result.trusted).toBe(false);
    expect(result.trusted ? "" : result.message).toContain("dotnet dev-certs https --trust");
    expect(dotnet.calls).toHaveLength(1);
    expect(existsSync(join(root, ".certs"))).toBe(false);
  });

  it("says the .NET SDK is missing when dotnet itself is not found, not to run a dotnet command", () => {
    const root = newRoot();

    const result = checkCertificate(fakeDotnet(null).run, "darwin", root);

    expect(result).toEqual({ trusted: false, message: NO_DOTNET_MESSAGE });
    expect(NO_DOTNET_MESSAGE).not.toContain("dotnet dev-certs");
    expect(existsSync(join(root, ".certs"))).toBe(false);
  });

  it("says a written certificate failed apart from an untrusted one", () => {
    const result = checkCertificate(fakeDotnet(0, 1).run, "darwin", newRoot());

    expect(result.trusted ? "" : result.message).toContain("could not be written");
  });

  it("tells Windows and Mac what the trust command, and an export, will ask", () => {
    expect(untrustedMessage("win32")).toContain("Windows asks you to confirm");
    expect(untrustedMessage("darwin")).toContain("macOS asks for your password");
    expect(untrustedMessage("linux")).toContain("aka.ms/dev-certs-trust");
    expect(exportNotice("darwin")).toContain("Always Allow");
    expect(exportNotice("win32")).not.toContain("keychain");
  });
});
