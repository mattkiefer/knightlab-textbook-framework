#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$FrameworkRepo = "https://github.com/mattkiefer/knightlab-textbook-framework.git"

function Refresh-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    $user = [Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH = "$machine;$user"
}

function Get-CodeCli {
    $command = Get-Command "code" -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $fixed = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\bin\code.cmd"
    if (Test-Path $fixed) { return $fixed }
    return $null
}

if (-not (Get-Command "winget" -ErrorAction SilentlyContinue)) {
    throw "Windows Package Manager (winget) is required. Install App Installer from the Microsoft Store and rerun this script."
}

if (-not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Git..."
    winget install --id Git.Git --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Git installation failed." }
    Refresh-SessionPath
}

if (-not (Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Node.js (needed to package the extension)..."
    winget install --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Node.js installation failed." }
    Refresh-SessionPath
}

$DockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
if (-not (Test-Path $DockerExe)) {
    Write-Host "Installing Docker Desktop..."
    winget install --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop installation failed." }
}

$VsCodeExe = Join-Path $env:LOCALAPPDATA "Programs\Microsoft VS Code\Code.exe"
if (-not (Test-Path $VsCodeExe)) {
    Write-Host "Installing Visual Studio Code..."
    winget install --id Microsoft.VisualStudioCode --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "Visual Studio Code installation failed." }
    Refresh-SessionPath
}

$CodeCli = Get-CodeCli
if (-not $CodeCli) {
    throw "Could not find the VS Code command-line tool. Close and reopen PowerShell, then rerun this script."
}

$TempDir = Join-Path ([IO.Path]::GetTempPath()) ("knightlab-textbook-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null
try {
    $FrameworkDir = Join-Path $TempDir "framework"
    $VsixPath = Join-Path $TempDir "knightlab-textbook-framework.vsix"

    Write-Host "Downloading the textbook framework..."
    git clone --depth 1 --branch main $FrameworkRepo $FrameworkDir
    if ($LASTEXITCODE -ne 0) { throw "Could not download the framework repository." }

    Write-Host "Packaging and installing the framework extension..."
    Push-Location $FrameworkDir
    try {
        npx --yes @vscode/vsce package --out $VsixPath
        if ($LASTEXITCODE -ne 0) { throw "Could not package the framework extension." }
    } finally {
        Pop-Location
    }

    & $CodeCli --install-extension $VsixPath --force
    if ($LASTEXITCODE -ne 0) { throw "Could not install the textbook framework extension." }
    & $CodeCli --install-extension ms-vscode-remote.remote-containers --force
    if ($LASTEXITCODE -ne 0) { throw "Could not install the Dev Containers extension." }
} finally {
    Remove-Item -LiteralPath $TempDir -Recurse -Force
}

Write-Host "Starting Docker Desktop..."
if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
    Start-Process $DockerExe
}

Write-Host "Waiting for Docker Desktop to start..."
$WaitSeconds = 0
while ($true) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
    $WaitSeconds += 2
    if ($WaitSeconds -ge 180) {
        throw "Docker did not start within 3 minutes. Start Docker Desktop and rerun this script."
    }
}

Write-Host ""
Write-Host "Setup is complete. In VS Code, run:"
Write-Host "  Knight Lab: Open Textbook"
Write-Host "Choose a book and a folder for its local files."
& $CodeCli --new-window
