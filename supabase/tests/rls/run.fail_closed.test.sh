#!/usr/bin/env bash
# Offline regression gate for run.sh.  It places a committed fake `docker`
# first on PATH, so no Docker daemon, database, network, or production access
# is involved.  The fake returns a psql error only when ON_ERROR_STOP is passed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RUNNER="$HERE/run.sh"
FIXTURE="$HERE/fail_closed_fixture"

# Never fall through to a real Docker executable if packaging omitted the fake.
if [[ ! -f "$FIXTURE/bin/docker" || ! -x "$FIXTURE/bin/docker" || -L "$FIXTURE/bin/docker" ]]; then
  echo 'FAIL: offline fake Docker fixture missing or unsafe; refusing to run.' >&2
  exit 2
fi

run_case() {
  local label="$1" stage="$2" expected="$3" output status
  set +e
  output="$(PATH="$FIXTURE/bin:$PATH" FAKE_DOCKER_FAIL_STAGE="$stage" \
    bash "$RUNNER" "$FIXTURE/valid_migration.sql" "$FIXTURE/valid_assertions.test.sql" 2>&1)"
  status=$?
  set -e
  if [ "$expected" = fail ] && [ "$status" -eq 0 ]; then
    echo "FAIL: $label was falsely accepted" >&2
    echo "$output" >&2
    exit 1
  fi
  if [ "$expected" = pass ] && [ "$status" -ne 0 ]; then
    echo "FAIL: $label unexpectedly failed (exit $status)" >&2
    echo "$output" >&2
    exit 1
  fi
  if [[ "$output" == *'FAKE psql: ON_ERROR_STOP is missing'* ]] \
    || [[ "$output" != *'FAKE psql: ON_ERROR_STOP=1 observed'* ]]; then
    echo "FAIL: $label did not pass ON_ERROR_STOP to every synthetic psql call" >&2
    echo "$output" >&2
    exit 1
  fi
  echo "PASS: $label (exit $status)"
}

run_case 'clean synthetic run' none pass
run_case 'migration SQL error' migration fail
run_case 'RLS assertion SQL error' test fail
echo 'PASS: RLS runner is fail-closed without Docker or a database.'
