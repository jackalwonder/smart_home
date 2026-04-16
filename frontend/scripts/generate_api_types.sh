#!/bin/sh
set -eu

OPENAPI_PATH="${1:-../backend/openapi.json}"
OUTPUT_PATH="${2:-src/api/types.generated.ts}"

npx --yes openapi-typescript "$OPENAPI_PATH" -o "$OUTPUT_PATH"
echo "generated: $OUTPUT_PATH"
