#!/usr/bin/env bash
set -euo pipefail

version=v1.13.1
checksum=5652d8b7ba9efa71837c473d32d223a8a77264bc6e003ae311719a8644df3c56
distribution=ascii-image-converter_Linux_amd64_64bit
archive="$RUNNER_TEMP/$distribution.tar.gz"

curl --fail --location --retry 3 --retry-all-errors --silent --show-error \
  --connect-timeout 15 --max-time 60 \
  "https://github.com/TheZoraiz/ascii-image-converter/releases/download/$version/$distribution.tar.gz" \
  --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum -c -
tar --extract --gzip --file "$archive" --directory "$RUNNER_TEMP"
printf '%s\n' "$RUNNER_TEMP/$distribution" >>"$GITHUB_PATH"
