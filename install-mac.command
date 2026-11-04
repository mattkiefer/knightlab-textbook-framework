#!/usr/bin/env bash
set -euo pipefail

FRAMEWORK_REPO="https://github.com/mattkiefer/knightlab-textbook-framework.git"

if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -x /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x /usr/local/bin/brew ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  else
    echo "Homebrew installation completed, but its command was not found."
    exit 1
  fi
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Installing Git..."
  brew install git
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js (needed to package the extension)..."
  brew install node
fi

if [[ ! -d "/Applications/Docker.app" ]]; then
  echo "Installing Docker Desktop..."
  brew install --cask docker
fi

if [[ ! -d "/Applications/Visual Studio Code.app" ]]; then
  echo "Installing Visual Studio Code..."
  brew install --cask visual-studio-code
fi

CODE_CLI="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
if [[ ! -x "$CODE_CLI" ]]; then
  echo "Could not find the VS Code command-line tool at:"
  echo "  $CODE_CLI"
  exit 1
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Downloading the textbook framework..."
git clone --depth 1 --branch main "$FRAMEWORK_REPO" "$TEMP_DIR/framework"

echo "Packaging and installing the framework extension..."
(
  cd "$TEMP_DIR/framework"
  npx --yes @vscode/vsce package --out "$TEMP_DIR/knightlab-textbook-framework.vsix"
)
"$CODE_CLI" --install-extension "$TEMP_DIR/knightlab-textbook-framework.vsix" --force
"$CODE_CLI" --install-extension ms-vscode-remote.remote-containers --force

echo "Starting Docker Desktop..."
open -a Docker
echo "Waiting for Docker Desktop to start..."
WAIT_SECS=0
until docker info >/dev/null 2>&1; do
  sleep 2
  WAIT_SECS=$((WAIT_SECS + 2))
  if (( WAIT_SECS >= 180 )); then
    echo "Docker did not start within 3 minutes. Start Docker Desktop and try again."
    exit 1
  fi
done

echo ""
echo "Setup is complete. In VS Code, run:"
echo "  Knight Lab: Open Textbook"
echo "Choose a book and a folder for its local files."
open -a "Visual Studio Code"
