#!/bin/sh
# Writes every capture into captures/ and each run's exit code into
# captures/exit-codes.txt. Run from this folder inside an environment that has
# the versions pinned in pyproject.toml, e.g. `uv run ./capture.sh`.
set -u
out=captures
mkdir -p "$out"
: > "$out/exit-codes.txt"
root=$(pwd -P)

reset() { rm -rf .flake-state .pytest_cache; }
run() {
  name=$1; shift
  pytest "$@" --junitxml="$out/$name.xml" > /dev/null 2>&1
  echo "$name: $?  (pytest $*)" >> "$out/exit-codes.txt"
  # Absolute paths in skip and import messages would name this machine's folders.
  sed -e "s|$root/||g" -e "s|$HOME|~|g" "$out/$name.xml" > "$out/$name.tmp" && mv "$out/$name.tmp" "$out/$name.xml"
}

reset
run retries-off-attempt-1 tests/test_flaky.py
run retries-off-attempt-2-lf --lf tests/test_flaky.py

reset
run retries-on tests/test_flaky.py --reruns 2

reset
run retries-on-fail-on-flaky tests/test_flaky.py --reruns 2 --fail-on-flaky

reset
run retries-on-always-fails tests/test_always_fails.py --reruns 2

reset
run shapes tests/test_shapes.py tests/sub
run shapes-xunit1 tests/test_shapes.py tests/sub -o junit_family=xunit1
run collection-error broken

reset
