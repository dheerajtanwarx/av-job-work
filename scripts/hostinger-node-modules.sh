#!/bin/sh
# Hostinger publishes only the app folder (apps/api or apps/web), so pnpm's links into the
# repo-root node_modules break there. This swaps the app's node_modules for a self-contained
# copy made by `pnpm deploy`, laid out npm-style (real folders, no symlinks) in case the
# publish step drops symlinks. Run from the app folder, on the build server only.
# Usage: sh ../../scripts/hostinger-node-modules.sh <package-name> [--prod]
set -e
pkg="$1"
shift
out="../../.hostinger-deploy"
rm -rf "$out"
pnpm --filter "$pkg" deploy --legacy --config.node-linker=hoisted "$@" "$out"
rm -rf node_modules
mv "$out/node_modules" node_modules
rm -rf "$out"
