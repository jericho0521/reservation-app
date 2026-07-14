#!/bin/sh
set -eu

if [ "$#" -lt 2 ]; then
  echo "Usage: run-with-config.sh CONFIG_FILE COMMAND [ARGUMENTS...]" >&2
  exit 64
fi

config_file="$1"
shift
if [ ! -r "$config_file" ]; then
  echo "Generated service configuration is unavailable." >&2
  exit 66
fi

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ""|\#*) continue ;;
    [A-Za-z_]*=*)
      name=${line%%=*}
      case "$name" in
        *[!A-Za-z0-9_]*) echo "Generated service configuration contains an invalid variable name." >&2; exit 65 ;;
      esac
      ;;
    *) echo "Generated service configuration contains an invalid line." >&2; exit 65 ;;
  esac
done < "$config_file"

set -a
. "$config_file"
set +a
exec "$@"
