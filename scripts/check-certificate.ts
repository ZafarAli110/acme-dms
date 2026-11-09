// Stops `bun run dev`, `start` and `start:prod` before they start when this machine does not trust the ASP.NET Core
// development certificate (ACME-130): the web app is served over HTTPS with it, so without it the browser would show a
// warning page instead of the DMS. Trusted, it writes the certificate (not its key) to .certs/localhost.pem, where the
// end-to-end tests and the load test point Node and Bun (NODE_EXTRA_CA_CERTS): they do not read the system's trust
// store as a browser does.
//
//   bun scripts/check-certificate.ts
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Where the certificate is written for Node and Bun, from the repository's root. Ignored by git. */
export const CERTIFICATE_FILE = join(".certs", "localhost.pem");

/** Runs `dotnet` with these arguments; its exit code, or null when `dotnet` itself is not found. */
export type RunDotnet = (args: string[]) => number | null;

export type CertificateCheck = { trusted: true } | { trusted: false; message: string };

/** What to tell a developer whose machine does not trust the certificate: the one command, for their system. */
export function untrustedMessage(platform: NodeJS.Platform): string {
  const how =
    platform === "win32"
      ? "Windows asks you to confirm adding it: choose Yes."
      : platform === "darwin"
        ? "macOS asks for your password to add it to your keychain."
        : "Linux browsers do not read it from there: see https://aka.ms/dev-certs-trust for your distribution.";
  return [
    "The DMS is served over HTTPS on this machine, with the .NET development certificate, and this machine does not",
    "trust it yet. Run this once, then start again:",
    "",
    "  dotnet dev-certs https --trust",
    "",
    how,
  ].join("\n");
}

/**
 * Checks that the development certificate is there and trusted, and when it is, writes it for Node and Bun to
 * `root`/.certs/localhost.pem. `dotnet dev-certs` exports the private key beside it; the key is deleted at once: the
 * tests need only the certificate, and the web server gets the key from Aspire.
 */
export function checkCertificate(run: RunDotnet, platform: NodeJS.Platform, root: string): CertificateCheck {
  if (run(["dev-certs", "https", "--check", "--trust"]) !== 0) {
    return { trusted: false, message: untrustedMessage(platform) };
  }
  const file = join(root, CERTIFICATE_FILE);
  mkdirSync(join(root, ".certs"), { recursive: true });
  const exported = run(["dev-certs", "https", "--export-path", file, "--format", "Pem", "--no-password"]);
  rmSync(file.replace(/\.pem$/, ".key"), { force: true });
  if (exported !== 0) {
    return { trusted: false, message: `The development certificate is trusted, but could not be written to ${file}.` };
  }
  return { trusted: true };
}

function runDotnet(args: string[]): number | null {
  try {
    return Bun.spawnSync(["dotnet", ...args], { stdout: "ignore", stderr: "ignore" }).exitCode;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const result = checkCertificate(runDotnet, process.platform, join(import.meta.dir, ".."));
  if (!result.trusted) {
    console.error(result.message);
    process.exit(1);
  }
}
