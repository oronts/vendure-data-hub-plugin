# DataHub Plugin Naming Convention Standards

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement changes task-by-task.

**Goal:** Establish consistent naming conventions for all enums, types, and constants across the codebase.

**Architecture:** TypeScript enums with consistent key/value patterns based on usage context.

**Tech Stack:** TypeScript, GraphQL, React

---

## Convention Rules

### 1. Enum Keys: Always SCREAMING_SNAKE_CASE

All enum keys use `SCREAMING_SNAKE_CASE`:

```typescript
export enum ExampleEnum {
    FIRST_VALUE = '...',
    SECOND_VALUE = '...',
}
```

### 2. Enum Values: Based on Context

| Context | Value Pattern | Rationale | Examples |
|---------|---------------|-----------|----------|
| **GraphQL-exposed** (status, types visible in API) | `SCREAMING_SNAKE_CASE` | GraphQL convention | `'PENDING'`, `'COMPLETED'`, `'DRAFT'` |
| **Entity identifiers** (database entities, GraphQL types) | `SCREAMING_SNAKE_CASE` | Matches database/API conventions | `'PRODUCT'`, `'CUSTOMER'`, `'ORDER'` |
| **Hook stages** (lifecycle events) | `SCREAMING_SNAKE_CASE` | Event-like, matches GraphQL | `'BEFORE_EXTRACT'`, `'ON_ERROR'` |
| **Runtime identifiers** (adapters, internal types) | `lowercase` | Internal implementation detail | `'extractor'`, `'loader'`, `'operator'` |
| **Configuration values** (settings, options) | `lowercase` or `kebab-case` | Config file friendly | `'strict'`, `'source-wins'`, `'utf-8'` |
| **Operators/predicates** (comparison, logic) | `camelCase` | JS method-like semantics | `'eq'`, `'notIn'`, `'startsWith'` |
| **Domain events** (event type strings) | `SCREAMING_SNAKE_CASE` | Consistent with other enums | `'PIPELINE_STARTED'`, `'RECORD_LOADED'` |
| **HTTP methods** | `UPPERCASE` | HTTP standard | `'GET'`, `'POST'`, `'PUT'` |
| **Log levels** | `UPPERCASE` | Industry standard | `'DEBUG'`, `'INFO'`, `'ERROR'` |

---

## Current Enums Analysis

### Correctly Patterned Enums

| Enum | Context | Pattern | Status |
|------|---------|---------|--------|
| `PipelineStatus` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `RunStatus` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `RevisionType` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `StepType` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `RunMode` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `HookStage` | Hook stages | SCREAMING_SNAKE | ✅ |
| `HookActionType` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `VendureEntityType` | Entity identifiers | SCREAMING_SNAKE | ✅ |
| `SortOrder` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `HttpMethod` | HTTP standard | UPPERCASE | ✅ |
| `LogLevel` | Log standard | UPPERCASE | ✅ |
| `LogPersistenceLevel` | GraphQL-exposed | SCREAMING_SNAKE | ✅ |
| `AdapterType` | Runtime identifier | lowercase | ✅ |
| `AdapterCategory` | Runtime identifier | kebab-case | ✅ |
| `LoadStrategy` | Configuration | lowercase/kebab | ✅ |
| `ConflictStrategy` | Configuration | kebab-case | ✅ |
| `ChannelStrategy` | Configuration | lowercase | ✅ |
| `LanguageStrategy` | Configuration | lowercase | ✅ |
| `DrainStrategy` | Configuration | lowercase | ✅ |
| `ValidationMode` | Configuration | lowercase | ✅ |
| `AuthType` | Configuration | lowercase/kebab | ✅ |
| `ConnectionType` | Configuration | lowercase | ✅ |
| `SecretProvider` | Configuration | lowercase | ✅ |
| `PaginationType` | Configuration | lowercase/kebab | ✅ |
| `DatabasePaginationType` | Configuration | lowercase | ✅ |
| `GraphQLPaginationType` | Configuration | lowercase | ✅ |
| `RestPaginationStrategy` | Configuration | lowercase | ✅ |
| `GraphQLPaginationStyle` | Configuration | lowercase | ✅ |
| `FileFormat` | Configuration | lowercase | ✅ |
| `FileEncoding` | Configuration | lowercase/kebab | ✅ |
| `DatabaseType` | Configuration | lowercase | ✅ |
| `QueueType` | Configuration | lowercase | ✅ |
| `AckMode` | Configuration | lowercase | ✅ |
| `ErrorCategory` | Configuration | lowercase/kebab | ✅ |
| `RouteConditionOperator` | Operators | camelCase | ✅ |
| `DomainEventType` | Domain events | PascalCase | ✅ |
| `TriggerType` | Configuration | lowercase | ✅ |
| `RetryableNetworkErrorCode` | Error codes | UPPERCASE | ✅ |

---

## Shared Types Alignment

Type unions in `shared/types/` MUST match their corresponding enum values exactly:

```typescript
// In shared/types/pipeline.types.ts
export type ChannelStrategyValue = 'explicit' | 'inherit' | 'multi';  // matches enum

// In src/constants/enums.ts
export enum ChannelStrategy {
    EXPLICIT = 'explicit',
    INHERIT = 'inherit',
    MULTI = 'multi',
}
```

---

## Dashboard/UI Rules

1. **Import enums from constants** - Never hardcode string values
2. **Use enum values in comparisons** - `status === RunStatus.PENDING` not `status === 'PENDING'`
3. **Use enums in select options** - `{ value: VendureEntityType.PRODUCT, label: 'Product' }`

---

## Implementation Checklist

- [x] All enums follow the context-based value patterns
- [x] All shared types match their enum counterparts
- [x] All hardcoded strings replaced with enum references
- [x] All comparisons use enum values
- [x] All select options use enum values
- [x] Documentation examples use enums

---

## Migration Notes

When changing enum values:
1. Update the enum definition
2. Update corresponding shared type unions
3. Update all usages in src/
4. Update all usages in dashboard/
5. Update all documentation examples
6. Run TypeScript compilation to catch mismatches
