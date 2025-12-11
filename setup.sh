#!/bin/bash

# GradeBrowser Setup Script
# Installs Bun and project dependencies

set -e

echo "=== GradeBrowser Setup ==="
echo

# Check if bun is already installed
if command -v bun &> /dev/null; then
    echo "✓ Bun is already installed: $(bun --version)"
else
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    
    # Source the updated shell config to get bun in PATH
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    
    echo "✓ Bun installed: $(bun --version)"
fi

echo

# Install dependencies
echo "Installing dependencies..."
cd "$(dirname "$0")"
bun install

echo
echo "=== Setup Complete ==="
echo
echo "To start the server, run:"
echo "  bun run dev"
echo
echo "Or for production:"
echo "  bun run start"

