# Programmatic Field Mapping

`FieldMapperService` maps arbitrary records into a target shape outside a
pipeline operator. Use it when a custom plugin, resolver, or integration needs
the same ordered, typed transformation chain for every record. For ordinary
pipeline definitions, prefer the built-in operators documented in the
[operator reference](../reference/operators.md).

## Using the Service

The service and every input/result type are available from the package root:

```typescript
import {
    FieldMapperService,
    type MapperFieldMapping,
} from '@oronts/vendure-data-hub-plugin';

const mappings: MapperFieldMapping[] = [
    {
        source: 'externalSku',
        target: 'sku',
        required: true,
        transforms: [{ type: 'trim' }, { type: 'uppercase' }],
    },
    {
        source: 'availableFrom',
        target: 'availableFrom',
        transforms: [{
            type: 'date',
            date: {
                inputFormat: 'DD/MM/YYYY',
                outputFormat: 'YYYY-MM-DD',
            },
        }],
    },
];

const mapper = new FieldMapperService();
const result = mapper.mapRecord({
    externalSku: ' sku-1 ',
    availableFrom: '31/12/2024',
}, mappings);

if (!result.success) {
    throw new Error(result.errors.map(error => error.message).join('; '));
}
```

`mapRecords()` applies the same mapping list to an array and returns every
per-record result plus total, successful, and failed counts.

Common option behavior is explicit:

- `split.trim: true` trims each produced item before an optional index is
  selected;
- `replace.regex: true` treats `search` as a bounded safe regular
  expression, while the default mode treats it as literal text;
- `default.onlyIfEmpty` defaults to `true`; setting it to `false`
  replaces every input with the configured value;
- `join.fields` appends values without mutating arrays in the source record;
- value maps only match their own keys, and lookup tables use each transform's
  `fromField` and `toField`.

Pass lookup data with the mapping execution. Tables are indexed once for a
batch and never stored on the injected service, so concurrent pipelines and
channels cannot replace each other's lookup state:

```typescript
const result = mapper.mapRecord(source, mappings, {
    lookupTables: [{
        name: 'categories',
        data: [
            { externalCode: 'hardware', vendureCode: 'tools' },
        ],
    }],
});
```

## Vendure Dependency Injection

The Data Hub plugin exports `FieldMapperService` and `AutoMapperService` from
its Nest module. A consumer Vendure plugin can import `DataHubPlugin` and inject
the shared instances:

```typescript
import { Injectable } from '@nestjs/common';
import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import {
    DataHubPlugin,
    FieldMapperService,
} from '@oronts/vendure-data-hub-plugin';

@Injectable()
class CatalogMappingService {
    constructor(private readonly mapper: FieldMapperService) {}
}

@VendurePlugin({
    imports: [PluginCommonModule, DataHubPlugin],
    providers: [CatalogMappingService],
})
export class CatalogIntegrationPlugin {}
```

`AutoMapperService.getConfig()` returns a detached configuration object.
`setConfig()` also copies nested caller values and rejects invalid confidence
thresholds, weights, aliases, or excluded fields before changing the active
configuration. Vendure injects AutoMapper as a transient provider, so each
consumer receives isolated service configuration. For concurrent jobs within
one consumer, pass the fourth `suggestMappings()` argument; per-call overrides
are validated, executed by call-local alias/fuzzy strategies, and never
persisted.

## Date Formats

Custom input and output formats support these exact UTC tokens:

| Token | Meaning |
|---|---|
| `YYYY` | Four-digit year |
| `MM` | Two-digit month |
| `DD` | Two-digit day |
| `HH` | Two-digit hour, `00`-`23` |
| `mm` | Two-digit minute |
| `ss` | Two-digit second |

Formats are limited to 128 characters. Parsing is exact: separators must match,
tokens cannot repeat, and impossible calendar or clock values are rejected.
Always specify `inputFormat` for non-ISO source data. A mismatch creates a
`MapperMappingError`, makes the mapping result unsuccessful, and preserves the
original value in the result so it can be inspected or quarantined.

The mapper does not expose a timezone option. Custom formats are interpreted in
UTC; ISO input without `inputFormat` may include an explicit `Z` or numeric
offset.

## Transform Ordering

Transforms execute in array order. A later transform receives the result of the
previous transform. The supported mapper transform families are:

- strings: `trim`, `lowercase`, `uppercase`, `replace`, `extract`, `split`,
  `join`, `concat`, and `template`;
- values: `convert`, `map`, `default`, `math`, `conditional`, and `custom`;
- lookups: `lookup`, backed by tables registered on the service instance;
- dates: `date`, with optional exact input and output formats.

Required-field and transform failures are returned as data in `errors`; callers
must check `success` before persisting the mapped record.
