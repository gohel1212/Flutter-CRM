#!/bin/bash

# Exit on error
set -e

# Define Flutter branch (stable is recommended)
FLUTTER_BRANCH="stable"

# Define where Flutter will be installed relative to the workspace
# Since Vercel builds in the root directory (or subdirectory), we will install Flutter outside
# the current directory to avoid uploading it as part of the deployment files.
FLUTTER_DIR="$PWD/../flutter-sdk"

echo "=== System Info ==="
uname -a
echo "Current Directory: $PWD"

echo "=== Installing/Updating Flutter SDK ==="
if [ -d "$FLUTTER_DIR" ]; then
  echo "Flutter directory already exists at $FLUTTER_DIR. Fetching updates..."
  cd "$FLUTTER_DIR"
  git fetch
  git checkout "$FLUTTER_BRANCH"
  git pull
  cd -
else
  echo "Cloning Flutter SDK ($FLUTTER_BRANCH branch) to $FLUTTER_DIR..."
  git clone https://github.com/flutter/flutter.git --depth 1 -b "$FLUTTER_BRANCH" "$FLUTTER_DIR"
fi

# Add Flutter to the path
export PATH="$FLUTTER_DIR/bin:$PATH"

echo "=== Flutter Version Info ==="
flutter --version

echo "=== Configuring Flutter for Web ==="
flutter config --enable-web

echo "=== Getting Dependencies ==="
flutter pub get

echo "=== Building Flutter Web (Release) ==="
if [ -n "$API_BASE_URL" ]; then
  echo "Building with API_BASE_URL=$API_BASE_URL"
  flutter build web --release --dart-define=API_BASE_URL="$API_BASE_URL"
else
  echo "Building with default API_BASE_URL (localhost)"
  flutter build web --release
fi

echo "=== Build Finished Successfully ==="
