#!/bin/sh
# Hostinger publishes only the app folder (apps/api or apps/web), so pnpm's links into the
# repo-root node_modules break there. This swaps the app's node_modules for a self-contained
# copy made by `pnpm deploy`, laid out npm-style (real folders, no symlinks) in case the
# publish step drops symlinks.
# Runs only on Hostinger's build server (it builds under .../hbuilds/...) or with HOSTINGER_BUILD=1;
# anywhere else it does nothing, so local `pnpm build` is unaffected.
# Usage (from the app folder): sh ../../scripts/hostinger-node-modules.sh <package-name> [--prod]
set -e
case "$PWD" in
  */hbuilds/*) ;;
  *) [ "$HOSTINGER_BUILD" = "1" ] || exit 0 ;;
esac
pkg="$1"
shift
out="../../.hostinger-deploy"
rm -rf "$out"
pnpm --filter "$pkg" deploy --legacy --config.node-linker=hoisted "$@" "$out"
rm -rf node_modules
mv "$out/node_modules" node_modules
rm -rf "$out"
