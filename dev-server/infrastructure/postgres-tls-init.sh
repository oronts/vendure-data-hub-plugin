#!/bin/sh

set -eu

HBA_FILE="$PGDATA/pg_hba.conf"
HBA_TEMP_FILE="$PGDATA/pg_hba.conf.datahub-tls"

printf '%s\n' \
    'hostnossl all all all reject' \
    'hostssl all all all cert' > "$HBA_TEMP_FILE"
cat "$HBA_FILE" >> "$HBA_TEMP_FILE"
mv "$HBA_TEMP_FILE" "$HBA_FILE"
