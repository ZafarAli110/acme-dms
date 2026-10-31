# Acme DMS setup for Windows: Git, Node.js 26 (through fnm), Bun, the .NET 10 SDK, Docker Desktop and the Aspire CLI.
# Anything already installed is skipped, so it is safe to run again.
#
# Run PowerShell as administrator (right-click PowerShell > Run as administrator), go to this folder, then:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-Location $PSScriptRoot

function Say($Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }
function Note($Text) { Write-Host "  $Text" }
function Have($Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

# Installers add themselves to PATH in the registry; read it again so this session sees them straight away.
function Update-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

# Add a folder to your user PATH (once), for this session and every new terminal.
function Add-ToPath($Folder) {
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $user) { $user = "" }
  if (-not (($user -split ";") -contains $Folder)) {
    [Environment]::SetEnvironmentVariable("Path", ($user.TrimEnd(";") + ";" + $Folder).TrimStart(";"), "User")
    Note "added $Folder to your PATH"
  }
  Update-Path
}

function Install-WithWinget($Id) {
  winget install --id $Id --exact --source winget --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget could not install $Id (exit code $LASTEXITCODE)" }
  Update-Path
}

# ── Administrator, winget, and profiles that are allowed to run ─────────────────────────────────────────────────────
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "Please run PowerShell as administrator: right-click PowerShell > Run as administrator, then run this again." -ForegroundColor Yellow
  exit 1
}
if (-not (Have "winget")) {
  Write-Host "winget is missing. Install 'App Installer' from the Microsoft Store, then run this again." -ForegroundColor Yellow
  exit 1
}
# fnm is switched on from your PowerShell profile, which only runs if the policy allows local scripts.
if ((Get-ExecutionPolicy -Scope CurrentUser) -in @("Undefined", "Restricted")) {
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
  Note "PowerShell may now run local scripts for you (execution policy RemoteSigned, your user only)"
}

# ── 1. Git ──────────────────────────────────────────────────────────────────────────────────────────────────────────
Say "Git"
if (Have "git") { Note "already installed: $(git --version)" } else { Install-WithWinget "Git.Git" }

# ── 2. Node.js 26, through fnm: your existing Node (if any) stays as it is ─────────────────────────────────────────
Say "Node.js 26 (through fnm)"
$existingNode = $null
if (Have "node") { $existingNode = (node -v) }
if (Have "fnm") { Note "fnm already installed" } else { Install-WithWinget "Schniz.fnm" }

# fnm switches Node per folder: inside acme-dms it reads .nvmrc (26). Turn it on in every PowerShell profile.
$profileLine = "fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression"
$documents = [Environment]::GetFolderPath("MyDocuments")
foreach ($profileFile in @("$documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1", "$documents\PowerShell\Microsoft.PowerShell_profile.ps1")) {
  if (-not ((Test-Path $profileFile) -and (Select-String -Path $profileFile -SimpleMatch $profileLine -Quiet))) {
    New-Item -ItemType File -Force -Path $profileFile | Out-Null
    Add-Content -Path $profileFile -Value "`n# added by Acme DMS setup: Node versions per folder`n$profileLine"
    Note "fnm switched on in $profileFile"
  }
}
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression

if ((fnm list) -match "v26\.") { Note "Node 26 already installed through fnm" } else { fnm install 26 }
if ($existingNode) {
  # Keep your existing Node outside this folder: no fnm default. Then check it in a fresh PowerShell.
  fnm unalias default 2>$null
  $outside = powershell -NoProfile -Command "Set-Location `$HOME; $profileLine; node -v" 2>$null
  if ($outside -eq $existingNode) {
    Note "your Node $existingNode is unchanged outside acme-dms; inside it, fnm uses Node 26"
  } else {
    fnm default 26
    Note "could not keep Node $existingNode as the default, so fnm's Node 26 is the default now ('fnm default <version>' to change it)"
  }
}

# ── 3. Bun ──────────────────────────────────────────────────────────────────────────────────────────────────────────
Say "Bun"
if (Have "bun") { Note "already installed: bun $(bun --version)" } else {
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"
  Add-ToPath "$env:USERPROFILE\.bun\bin"
}

# ── 4. .NET 10 SDK ──────────────────────────────────────────────────────────────────────────────────────────────────
Say ".NET 10 SDK"
$sdks = if (Have "dotnet") { (dotnet --list-sdks) -join "`n" } else { "" }
if ($sdks -match "(?m)^10\.") { Note "already installed: .NET SDK $((dotnet --list-sdks | Select-String '^10\.' | Select-Object -Last 1).ToString().Split(' ')[0])" } else { Install-WithWinget "Microsoft.DotNet.SDK.10" }

# ── 5. Docker Desktop (needs WSL 2) ─────────────────────────────────────────────────────────────────────────────────
Say "Docker Desktop"
$dockerApp = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
$restart = $false
if ((Test-Path $dockerApp) -or (Have "docker")) { Note "already installed" } else {
  wsl --status *> $null
  if ($LASTEXITCODE -ne 0) {
    Note "installing WSL 2, which Docker Desktop runs on"
    wsl --install --no-distribution
    $restart = $true
  }
  Install-WithWinget "Docker.DockerDesktop"
  $restart = $true
}

# ── 6. Aspire CLI ───────────────────────────────────────────────────────────────────────────────────────────────────
Say "Aspire CLI"
$aspireBin = "$env:USERPROFILE\.aspire\bin"
if ((Have "aspire") -or (Test-Path "$aspireBin\aspire.exe")) {
  Add-ToPath $aspireBin
  Note "already installed"
} else {
  powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://aspire.dev/install.ps1 | iex"
  Add-ToPath $aspireBin
}

# ── 7. This repository's packages ───────────────────────────────────────────────────────────────────────────────────
Say "Packages (bun install)"
bun install
if ($LASTEXITCODE -ne 0) { throw "bun install failed" }

# ── Done ────────────────────────────────────────────────────────────────────────────────────────────────────────────
Say "Installed"
foreach ($check in @("git --version", "node -v", "bun --version", "dotnet --version", "aspire --version", "docker --version")) {
  $tool = $check.Split(" ")[0]
  if (Have $tool) { Note "$($check.PadRight(18)) $(Invoke-Expression $check 2>$null | Select-Object -First 1)" } else { Note "$($check.PadRight(18)) (open a new terminal to see it)" }
}
Write-Host ""
if ($restart) { Write-Host "Restart Windows once (WSL 2 and Docker Desktop need it), then start Docker Desktop." -ForegroundColor Yellow }
Write-Host "Open a new terminal in this folder, start Docker Desktop, then: bun run dev"
