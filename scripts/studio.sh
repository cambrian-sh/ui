#!/usr/bin/env bash
# One command to a live Studio: start the local kernel if it is not running,
# then run the desktop app with the dev bridge on, so the same live session is
# also reachable from a browser tab at http://localhost:1420.
#
#   bun run studio            # local kernel on :50051
#   CAMBRIAN_KERNEL_PORT=0 bun run studio   # skip the local kernel (remote endpoint)
#
# Sign in once in the native window with "Remember" ticked; after that Studio
# reconnects on launch, in the window and in any browser tab, without a prompt.
set -euo pipefail
cd "$(dirname "$0")/.."

KERNEL_BIN="${CAMBRIAN_BIN:-$HOME/.cambrian/bin/cambrian}"
KERNEL_PORT="${CAMBRIAN_KERNEL_PORT:-50051}"

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if [[ "$KERNEL_PORT" != "0" ]]; then
  if port_open "$KERNEL_PORT"; then
    echo "[studio] kernel already listening on :$KERNEL_PORT"
  elif [[ -x "$KERNEL_BIN" ]]; then
    echo "[studio] starting kernel: $KERNEL_BIN start"
    # A kernel that fails to start is reported, not fatal: Studio still opens
    # and says it is disconnected, and can be pointed at another endpoint.
    "$KERNEL_BIN" start || echo "[studio] kernel did not start (see above); continuing without it" >&2
  else
    echo "[studio] no kernel on :$KERNEL_PORT and $KERNEL_BIN not found; continuing without one" >&2
  fi
fi

export CAMBRIAN_STUDIO_BRIDGE=1
exec bun run tauri dev --features dev-bridge
