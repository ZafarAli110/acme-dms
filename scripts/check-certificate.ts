// Stops `bun run dev`, `start` and `start:prod` before they start when this machine does not trust the ASP.NET Core
// development certificate (ACME-130): the web app is served over HTTPS with it, so without it the browser would show a
// warning page instead of the DMS. Trusted, it writes the certificate to .certs/localhost.pem and its key beside it
// (.certs/ is ignored by git, the files readable by you alone): the web server serves HTTPS with them (the AppHost
// passes the paths), and the end-to-end tests and the load test point Node and Bun at the certificate
// (NODE_EXTRA_CA_CERTS), as they do not read the system's trust store as a browser does.
//
//   bun scripts/check-certificate.ts
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/** Where the certificate is written, from the repository's root; its key is `localhost.key` beside it. Ignored by git. */
export const CERTIFICATE_FILE = join(".certs", "localhost.pem");
export const KEY_FILE = join(".certs", "localhost.key");

/** Runs `dotnet` with these arguments; its exit code, or null when `dotnet` itself is not found. */
export type RunDotnet = (args: string[]) => number | null;

export type CertificateCheck = { trusted: true } | { trusted: false; message: string };

/**
 * No `dotnet` on the PATH: the trust command would not run either, so say what is missing first. The .NET SDK makes the
 * certificate as well as running the services.
 */
export const NO_DOTNET_MESSAGE = [
  "The .NET SDK (`dotnet`) was not found, and the DMS needs it: it runs the .NET services, and its development",
  "certificate serves the DMS over HTTPS on this machine. Run the setup again (README, Setup), or install the .NET 10 SDK",
  "from https://dotnet.microsoft.com/download, open a new terminal, then start again.",
].join("\n");

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
 * Checks that the development certificate is there and trusted, and when it is, writes it and its key to `root`/.certs/
 * (`dotnet dev-certs` writes the key beside the certificate, unencrypted: `--no-password`), readable by the owner only.
 */
export function checkCertificate(run: RunDotnet, platform: NodeJS.Platform, root: string): CertificateCheck {
  const checked = run(["dev-certs", "https", "--check", "--trust"]);
  if (checked === null) {
    return { trusted: false, message: NO_DOTNET_MESSAGE };
  }
  if (checked !== 0) {
    return { trusted: false, message: untrustedMessage(platform) };
  }
  const file = join(root, CERTIFICATE_FILE);
  mkdirSync(join(root, ".certs"), { recursive: true });
  const exported = run(["dev-certs", "https", "--export-path", file, "--format", "Pem", "--no-password"]);
  if (exported !== 0 || !existsSync(join(root, KEY_FILE))) {
    return { trusted: false, message: `The development certificate is trusted, but could not be written to ${file}.` };
  }
  // A private key: on macOS and Linux, readable by its owner only (Windows keeps the folder's own permissions).
  chmodSync(join(root, KEY_FILE), 0o600);
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
