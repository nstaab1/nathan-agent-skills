#!/bin/sh
# Writes every capture into captures/ and each run's exit code into
# captures/exit-codes.txt. Run from this folder after `npm install`.
set -u
out=captures
mkdir -p "$out"
: > "$out/exit-codes.txt"
root=$(pwd -P)

reset() { rm -rf .flake-state node_modules/.vite node_modules/.vitest; }
run() {
  name=$1; shift
  npx vitest run "$@" --reporter=junit --outputFile="$out/$name.xml" > /dev/null 2>&1
  echo "$name: $?  (vitest run $*)" >> "$out/exit-codes.txt"
  # Absolute paths in stack traces would name this machine's folders.
  sed -e "s|$root/||g" -e "s|$HOME|~|g" "$out/$name.xml" > "$out/$name.tmp" && mv "$out/$name.tmp" "$out/$name.xml"
}

reset
run retries-off-attempt-1 tests/flaky.spec.js
run retries-off-attempt-2-lastfailed --lastFailed tests/flaky.spec.js

reset
run retries-on tests/flaky.spec.js --retry 2

reset
run retries-on-always-fails tests/always-fails.spec.js --retry 2

reset
run shapes tests/shapes.spec.js tests/sub
run import-error broken

reset
