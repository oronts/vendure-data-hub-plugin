# Schema Registry

The schema registry stores named, immutable record contracts. Pipelines bind an
Extract or Validate step to one exact version so an external payload change does
not silently change the pipeline contract.

## Create a Version

1. Open **Data Hub > Schemas**.
2. Select **New schema version**.
3. Enter a stable schema ID, a version label, and a compatibility mode.
4. Enter a Data Hub schema definition as JSON.
5. Create the version, then select it from an Extract or Validate step.

Schema IDs start with a letter and may contain letters, numbers, dots, hyphens,
and underscores. Version labels may contain letters, numbers, dots, hyphens,
underscores, and plus signs. A schema ID/version pair is unique.

## Definition Format

The persisted registry uses the Data Hub `fields` dialect. It does not claim to
implement arbitrary JSON Schema, Avro, Zod, references, unions, computed fields,
or transformation expressions.

```json
{
  "$id": "catalog.product",
  "$version": "1.0.0",
  "fields": {
    "sku": {
      "type": "string",
      "required": true,
      "validation": { "minLength": 1, "maxLength": 255 }
    },
    "price": {
      "type": "decimal",
      "validation": { "min": 0 }
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "validation": { "maxItems": 50 }
    }
  }
}
```

Supported types are `string`, `text`, `number`, `integer`, `float`, `decimal`,
`boolean`, `null`, `json`, `object`, `array`, and `enum`. String constraints are
`minLength`, `maxLength`, and `pattern`; numeric constraints are `min` and
`max`; array constraints are `minItems` and `maxItems`. Object fields require a
nested `fields` object, array fields require `items`, and enum fields require a
non-empty primitive `enum` array. Unsafe regular expressions are rejected.

If `$id` or `$version` is present, it must match the registry entry.

## Compatibility Modes

- `STRICT` requires a new definition to match the preceding version exactly.
  At runtime it also rejects undeclared fields.
- `BACKWARD` allows optional additions and undeclared runtime fields, but
  rejects new required fields, narrower constraints, removed enum values, and
  incompatible type changes.
- `PERMISSIVE` accepts evolution and runtime mismatches, but emits a structured
  warning containing the schema ID, version, step, and mismatch count.

Compatibility is checked against the most recently created version with the
same schema ID.

## Immutability and Impact

Definitions and compatibility modes cannot be edited. Create a new version for
every contract change. Metadata is the only mutable field.

The detail page shows working pipeline definitions, immutable revisions, and
run snapshots that reference the version. Deletion is blocked while any of
those references exists. Historical run snapshots are included so deleting a
contract cannot make an audit record impossible to interpret.

## Permissions

- `ReadDataHubSchema` opens the list/detail routes and schema selectors.
- `CreateDataHubSchema` creates immutable versions.
- `UpdateDataHubSchema` edits metadata.
- `DeleteDataHubSchema` deletes versions that have no references.

Backend permission checks are authoritative; hiding a Dashboard action is only
a usability measure.

## Deployment

The registry adds the `data_hub_schema` entity. Existing installations must
generate and apply a host-project Vendure migration before using the feature.
See [Database and Upgrade Migrations](../deployment/migrations.md#schema-registry-upgrade).
