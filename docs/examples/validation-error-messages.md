# Enhanced Validation Error Messages

The `ValidationBuilder` now provides rich, contextual error messages that help developers quickly identify and fix data issues.

## Basic Usage with Context

```typescript
import { ValidationBuilder } from '@oronts/vendure-data-hub-plugin';

// Simple validation with record identifier
const result = new ValidationBuilder()
    .withIdentifier(`email="${record.emailAddress}"`)
    .requireEmail('emailAddress', record.emailAddress)
    .requireString('firstName', record.firstName)
    .build();
```

**Before** (without context):
```
Validation failed
  Failures:
    - emailAddress: Invalid email format
    - firstName: Missing required field
```

**After** (with context):
```
Validation failed (email="max@example.com")
  Failures:
    - emailAddress: Invalid email format (received: "not-an-email")
    - firstName: Missing required field
```

## With Line Numbers (CSV Import)

```typescript
const result = new ValidationBuilder()
    .withIdentifier(`email="${record.emailAddress}"`)
    .withLineNumber(record._lineNumber)  // from CSV parser
    .requireEmail('emailAddress', record.emailAddress)
    .requireString('firstName', record.firstName)
    .build();
```

**Error message**:
```
Validation failed (email="max@example.com", line: 42)
  Failures:
    - emailAddress: Invalid email format (received: "not-an-email")
    - firstName: Missing required field
```

## Custom Format Errors

Use `addFormatError()` for fields with specific format requirements:

```typescript
const result = new ValidationBuilder()
    .withIdentifier(`sku="${record.sku}"`)
    .requireString('name', record.name)
    .addFormatError('phoneNumber', '+XX-XXX-XXX-XXXX', record.phoneNumber)
    .build();
```

**Error message**:
```
Validation failed (sku="WIDGET-001")
  Failures:
    - phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")
```

## Nested Array Validation

Array validation automatically includes indices:

```typescript
const result = new ValidationBuilder()
    .withIdentifier(`email="${record.emailAddress}"`)
    .withLineNumber(42)
    .validateArrayItems('addresses', record.addresses, (addr, index) => {
        const errors = [];
        if (!addr.streetLine1) {
            errors.push({
                field: 'streetLine1',
                message: 'Street line 1 is required',
                code: 'REQUIRED'
            });
        }
        if (!addr.countryCode) {
            errors.push({
                field: 'countryCode',
                message: 'Country code is required',
                code: 'REQUIRED'
            });
        }
        return errors;
    })
    .build();
```

**Error message**:
```
Validation failed (email="max@example.com", line: 42)
  Failures:
    - addresses[0].streetLine1: Street line 1 is required
    - addresses[1].countryCode: Country code is required
```

## Complete Example: Customer Loader

```typescript
async validate(
    ctx: RequestContext,
    record: CustomerInput,
    operation: TargetOperation,
): Promise<EntityValidationResult> {
    // Build identifier for better error messages
    const identifier = record.emailAddress || record.id || 'unknown';

    const builder = new ValidationBuilder()
        .withIdentifier(`email="${identifier}"`)
        .withLineNumber(record._lineNumber)
        .requireEmailForCreate('emailAddress', record.emailAddress, operation)
        .requireStringForCreate('firstName', record.firstName, operation)
        .requireStringForCreate('lastName', record.lastName, operation);

    // Validate addresses if provided
    if (record.addresses && Array.isArray(record.addresses)) {
        builder.validateArrayItems('addresses', record.addresses, (addr) => {
            const errors = [];
            if (!addr.streetLine1) {
                errors.push({ field: 'streetLine1', message: 'Required', code: 'REQUIRED' });
            }
            if (!addr.city) {
                errors.push({ field: 'city', message: 'Required', code: 'REQUIRED' });
            }
            if (!addr.countryCode) {
                errors.push({ field: 'countryCode', message: 'Required', code: 'REQUIRED' });
            }
            return errors;
        });
    }

    return builder.build();
}
```

**Error message example**:
```
Customer validation failed (email="max@example.com", line: 42)
  Failures:
    - firstName: Missing required field
    - phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")
    - addresses[0].streetLine1: Required
```

## API Reference

### `.withIdentifier(identifier: string)`

Sets a human-readable identifier for the record (e.g., email, SKU, order code).

**Examples:**
- `withIdentifier('email="max@example.com"')`
- `withIdentifier('sku="WIDGET-001"')`
- `withIdentifier('code="ORD-2024-001"')`

### `.withLineNumber(lineNo: number)`

Sets the source line number (e.g., CSV row number).

**Example:**
- `withLineNumber(record._lineNumber)`

### `.addFormatError(field, expectedFormat, receivedValue, code?)`

Adds a format validation error with expected format and received value context.

**Example:**
```typescript
builder.addFormatError(
    'phoneNumber',
    '+XX-XXX-XXX-XXXX',
    record.phoneNumber,
    'INVALID_FORMAT'
);
```

**Results in:**
```
phoneNumber: Invalid format (expected: +XX-XXX-XXX-XXXX, received: "123456")
```

## Migration Guide

### Updating Existing Loaders

**Before:**
```typescript
async validate(ctx, record, operation) {
    return new ValidationBuilder()
        .requireEmail('emailAddress', record.emailAddress)
        .build();
}
```

**After:**
```typescript
async validate(ctx, record, operation) {
    const identifier = record.emailAddress || record.id || 'unknown';

    return new ValidationBuilder()
        .withIdentifier(`email="${identifier}"`)
        .withLineNumber(record._lineNumber)  // if available from CSV
        .requireEmail('emailAddress', record.emailAddress)
        .build();
}
```

### Choosing an Identifier

Use the most recognizable field for your entity type:

- **Customer**: `email="${record.emailAddress}"`
- **Product**: `slug="${record.slug}"`
- **Order**: `code="${record.code}"`
- **Asset**: `source="${record.sourceUrl}"`
- **SKU-based entities**: `sku="${record.sku}"`

### Line Numbers from CSV

Most CSV parsers add `_lineNumber` or `_rowIndex` to records:

```typescript
.withLineNumber(record._lineNumber || record._rowIndex)
```

If you're parsing CSV manually, ensure your parser adds this metadata.

## Benefits

1. **Faster debugging**: Immediately identify which record failed
2. **Better logs**: Error messages include record context
3. **CSV integration**: Line numbers help locate issues in source files
4. **Expected vs Received**: Format errors show what was expected and what was received
5. **Nested validation**: Array indices clarify which item has issues
