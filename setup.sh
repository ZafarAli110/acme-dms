#!/usr/bin/env bash
# Acme DMS setup for macOS: Git, Node.js 26 (through fnm), Bun, the .NET 10 SDK, Docker Desktop and the Aspire CLI.
# Anything already installed is skipped, so it is safe to run again. It may ask for your password (Homebrew, .NET
# and Docker Desktop install into system folders).
#
#   ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[36m== %s\033[0m\n' "$1"; }
note() { echo "  $1"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [ "$(uname -s)" != Darwin ]; then
  echo "This script is for macOS. On Windows, run setup.ps1 in PowerShell as administrator."
  exit 1
fi

# The startup file of your shell: PATH and fnm are set up there for every new terminal.
case "${SHELL:-}" in
  */bash) PROFILE="$HOME/.bash_profile"; SHELL_NAME=bash ;;
  *) PROFILE="$HOME/.zshrc"; SHELL_NAME=zsh ;;
esac
touch "$PROFILE"

# Add a line to the startup file (once), for every new terminal.
add_line() {
  if ! grep -qsF "$1" "$PROFILE"; then
    printf '\n# added by Acme DMS setup\n%s\n' "$1" >>"$PROFILE"
    note "added to $PROFILE: $1"
  fi
}

# ── 1. Homebrew: installs the rest ──────────────────────────────────────────────────────────────────────────────────
say "Homebrew"
if have brew; then note "already installed"; else
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi
for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$brew_path" ]; then add_line "eval \"\$($brew_path shellenv)\""; eval "$($brew_path shellenv)"; break; fi
done

# ── 2. Git ──────────────────────────────────────────────────────────────────────────────────────────────────────────
say "Git"
if git --version >/dev/null 2>&1; then note "already installed: $(git --version)"; else brew install git; fi

# ── 3. Node.js 26, through fnm: your existing Node (if any) stays as it is ─────────────────────────────────────────
say "Node.js 26 (through fnm)"
existing_node=""
if have node; then existing_node="$(node -v)"; fi
if have fnm; then note "fnm already installed"; else brew install fnm; fi
# fnm switches Node per folder: inside acme-dms it reads .nvmrc (26)
add_line "eval \"\$(fnm env --use-on-cd --shell $SHELL_NAME)\""
eval "$(fnm env --shell bash)" # for the rest of this script (it runs in bash)
if fnm list | grep -q "v26\."; then note "Node 26 already installed through fnm"; else fnm install 26; fi
if [ -n "$existing_node" ]; then
  # Keep your existing Node outside this folder: no fnm default. Then check it in a fresh shell.
  fnm unalias default >/dev/null 2>&1 || true
  outside="$("$SHELL_NAME" -ic 'cd ~ && node -v' 2>/dev/null | tail -1 || true)"
  if [ "$outside" = "$existing_node" ]; then
    note "your Node $existing_node is unchanged outside acme-dms; inside it, fnm uses Node 26"
  else
    fnm default 26
    note "could not keep Node $existing_node as the default, so fnm's Node 26 is the default now ('fnm default <version>' to change it)"
  fi
fi

# ── 4. Bun ──────────────────────────────────────────────────────────────────────────────────────────────────────────
say "Bun"
if have bun; then note "already installed: bun $(bun --version)"; else
  curl -fsSL https://bun.sh/install | bash
  add_line 'export PATH="$HOME/.bun/bin:$PATH"'
  export PATH="$HOME/.bun/bin:$PATH"
fi

# ── 5. .NET 10 SDK ──────────────────────────────────────────────────────────────────────────────────────────────────
say ".NET 10 SDK"
if have dotnet && dotnet --list-sdks | grep -q '^10\.'; then
  note "already installed: .NET SDK $(dotnet --list-sdks | grep '^10\.' | tail -1 | cut -d' ' -f1)"
else
  brew install --cask dotnet-sdk
  add_line 'export PATH="/usr/local/share/dotnet:$PATH"'
  export PATH="/usr/local/share/dotnet:$PATH"
fi

# ── 6. Docker Desktop ───────────────────────────────────────────────────────────────────────────────────────────────
say "Docker Desktop"
if [ -d /Applications/Docker.app ] || have docker; then note "already installed"; else
  brew install --cask docker-desktop
fi

# ── 7. Aspire CLI ───────────────────────────────────────────────────────────────────────────────────────────────────
say "Aspire CLI"
if have aspire || [ -x "$HOME/.aspire/bin/aspire" ]; then note "already installed"; else
  curl -sSL https://aspire.dev/install.sh | bash
fi
add_line 'export PATH="$HOME/.aspire/bin:$PATH"'
export PATH="$HOME/.aspire/bin:$PATH"

# ── 8. This repository's packages ───────────────────────────────────────────────────────────────────────────────────
say "Packages (bun install)"
bun install

# ── Done ────────────────────────────────────────────────────────────────────────────────────────────────────────────
say "Installed"
for check in "git --version" "node -v" "bun --version" "dotnet --version" "aspire --version" "docker --version"; do
  tool="${check%% *}"
  if have "$tool"; then printf '  %-18s %s\n' "$check" "$($check 2>/dev/null | head -1)"; else printf '  %-18s %s\n' "$check" "(open a new terminal to see it)"; fi
done
echo
echo "Open a new terminal in this folder, start Docker Desktop (open -a Docker), then: bun run dev"
