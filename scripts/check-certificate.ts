// Stops `bun run dev`, `start` and `start:prod` before they start when this machine does not trust the ASP.NET Core
// development certificate (ACME-130): the web app is served over HTTPS with it, so without it the browser would show a
// warning page instead of the DMS. Trusted, it writes the certificate to .certs/localhost.pem and its key beside it
// (.certs/ is ignored by git, the files readable by you alone): the web server serves HTTPS with them (the AppHost
// passes the paths), and the end-to-end tests and the load test point Node and Bun at the certificate
// (NODE_EXTRA_CA_CERTS), as they do not read the system's trust store as a browser does.
//
//   bun scripts/check-certificate.ts
import { X509Certificate } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Where the certificate is written, from the repository's root; its key is `localhost.key` beside it. Ignored by git. */
export const CERTIFICATE_FILE = join(".certs", "localhost.pem");
export const KEY_FILE = join(".certs", "localhost.key");

/** Runs `dotnet` with these arguments: its exit code and what it printed, or null when `dotnet` itself is not found. */
export type RunDotnet = (args: string[]) => { exitCode: number; output: string } | null;

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

/** Said before an export, which can wait on a dialog: reading the key out of the macOS keychain asks first. */
export function exportNotice(platform: NodeJS.Platform): string {
  const dialog =
    platform === "darwin"
      ? " macOS may ask to let dotnet use the key in your keychain: choose Always Allow, and it will not ask again."
      : "";
  return `Writing the .NET development certificate to .certs/ for the web server and the tests (once).${dialog}`;
}

/** The thumbprint `dotnet dev-certs https --check` names ("A trusted certificate was found: C890…"), upper case. */
function trustedThumbprint(output: string): string | null {
  return /certificate was found: ([0-9A-Fa-f]{40})/.exec(output)?.[1]?.toUpperCase() ?? null;
}

/** The SHA-1 thumbprint of the certificate already in `file`, upper case, or null when there is none to read. */
function thumbprintOf(file: string): string | null {
  try {
    return new X509Certificate(readFileSync(file)).fingerprint.replaceAll(":", "").toUpperCase();
  } catch {
    return null;
  }
}

/**
 * Checks that the development certificate is there and trusted, and when it is, makes sure `root`/.certs/ holds it and
 * its key (`dotnet dev-certs` writes the key beside the certificate, unencrypted: `--no-password`), readable by the owner
 * only. It exports only when .certs/ does not already hold that certificate: on macOS an export reads the key out of
 * the keychain, which can ask first, and a start must not wait on a dialog every time. `say` tells the person first.
 */
export function checkCertificate(
  run: RunDotnet,
  platform: NodeJS.Platform,
  root: string,
  say: (line: string) => void = () => null,
): CertificateCheck {
  const checked = run(["dev-certs", "https", "--check", "--trust"]);
  if (checked === null) {
    return { trusted: false, message: NO_DOTNET_MESSAGE };
  }
  if (checked.exitCode !== 0) {
    return { trusted: false, message: untrustedMessage(platform) };
  }
  const file = join(root, CERTIFICATE_FILE);
  const trusted = trustedThumbprint(checked.output);
  if (trusted !== null && existsSync(join(root, KEY_FILE)) && thumbprintOf(file) === trusted) {
    return { trusted: true };
  }
  mkdirSync(join(root, ".certs"), { recursive: true });
  say(exportNotice(platform));
  const exported = run(["dev-certs", "https", "--export-path", file, "--format", "Pem", "--no-password"]);
  if (exported === null || exported.exitCode !== 0 || !existsSync(join(root, KEY_FILE))) {
    return { trusted: false, message: `The development certificate is trusted, but could not be written to ${file}.` };
  }
  // A private key: on macOS and Linux, readable by its owner only (Windows keeps the folder's own permissions).
  chmodSync(join(root, KEY_FILE), 0o600);
  return { trusted: true };
}

function runDotnet(args: string[]): { exitCode: number; output: string } | null {
  try {
    const result = Bun.spawnSync(["dotnet", ...args], { stdout: "pipe", stderr: "ignore" });
    return { exitCode: result.exitCode, output: result.stdout.toString() };
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const result = checkCertificate(runDotnet, process.platform, join(import.meta.dir, ".."), (line) =>
    console.log(line),
  );
  if (!result.trusted) {
    console.error(result.message);
    process.exit(1);
  }
}
