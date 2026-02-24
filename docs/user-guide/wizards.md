# Import and Export Wizards

Step-by-step guides for using the visual wizards to import and export data.

## Table of Contents

- [Overview](#overview)
- [Import Wizard](#import-wizard)
- [Export Wizard](#export-wizard)
- [Templates](#templates)
- [Field Mapping](#field-mapping)
- [Validation and Preview](#validation-and-preview)
- [Troubleshooting](#troubleshooting)

## Overview

Data Hub provides visual wizards for common import and export tasks, eliminating the need to write code for simple data operations.

### When to Use Wizards

**Use Wizards:**
- One-time data imports/exports
- Simple field mappings
- Standard Vendure entities (Products, Customers, etc.)
- Quick data migrations
- Ad-hoc reporting

**Use Pipelines:**
- Scheduled or automated operations
- Complex transformations
- Multi-step workflows
- Real-time integrations
- Custom business logic

### Accessing Wizards

1. Navigate to **Data Hub** in the Vendure admin
2. Click **Import Wizard** or **Export Wizard**
3. Follow the step-by-step interface

## Import Wizard

Import data from files or external sources into Vendure entities.

### Step 1: Choose Template

Select a pre-built template or start from scratch.

<p align="center">
  <img src="../images/import-wizard-templates.png" alt="Import Templates" width="700">
</p>

**Available Templates:**
- Products (Basic)
- Products with Variants
- Customers
- Orders
- Inventory
- Collections
- Facets

**Starting from Scratch:**
Click **Custom Import** to configure manually.

### Step 2: Select Source

Choose where your data comes from.

#### File Upload

1. Click **Upload File**
2. Select file (CSV, JSON, XML, XLSX)
3. Configure format options

**CSV Options:**
- Delimiter (comma, semicolon, tab)
- Has header row
- Quote character
- Encoding (UTF-8, ISO-8859-1, etc.)

**JSON Options:**
- Array path (for nested data)
- Pretty print
- Encoding

**XML Options:**
- Root element
- Row element
- Encoding

**Excel Options:**
- Sheet name or index
- Header row number
- Skip rows

#### HTTP API

1. Enter API URL
2. Configure authentication
3. Set data path
4. Configure pagination (if needed)

#### Database

1. Select connection
2. Choose table or enter SQL query
3. Preview data

#### FTP/SFTP

1. Select connection
2. Enter file path
3. Configure format

### Step 3: Preview Data

Review first 10 rows of source data.

<p align="center">
  <img src="../images/import-wizard-preview.png" alt="Data Preview" width="700">
</p>

**Actions:**
- Refresh preview
- Change format options
- Filter columns
- Transform values

### Step 4: Select Target Entity

Choose the Vendure entity to import into.

**Available Entities:**
- Product
- ProductVariant
- Customer
- Order
- Collection
- Facet
- FacetValue
- Asset
- Tag
- StockLocation
- Channel
- PaymentMethod
- ShippingMethod
- TaxRate
- Promotion

### Step 5: Map Fields

Map source fields to target entity fields.

<p align="center">
  <img src="../images/import-wizard-mapping.png" alt="Field Mapping" width="700">
</p>

#### Auto-Mapping

Click **Auto-Map** to automatically match fields by name.

Matches:
- `name` → `name`
- `sku` → `sku`
- `product_name` → `name`
- `email` → `emailAddress`

#### Manual Mapping

Drag source fields to target fields or use dropdowns.

**Required Fields** (marked with *):
- Depend on entity type
- Must be mapped or have default value

**Optional Fields:**
- Can be left unmapped
- Use default values

#### Field Transformations

Apply transformations during mapping:

1. Click **Transform** icon
2. Select transformation type
3. Configure options

**Available Transformations:**
- Uppercase/Lowercase
- Trim whitespace
- Split/Join
- Date format
- Number format
- Replace text
- Constant value
- Template (combine fields)

**Example:** Create slug from name
```
Source: name = "Product Name"
Transform: slugify
Result: slug = "product-name"
```

### Step 6: Configure Import Options

Set how data should be imported.

#### Strategy

**CREATE:**
- Only create new records
- Fails if record exists
- Fast for bulk imports

**UPDATE:**
- Only update existing records
- Skips if record doesn't exist
- Requires match field

**UPSERT:**
- Create if doesn't exist, update if exists
- Requires match field
- Most common choice

**MERGE:**
- Update only changed fields
- Preserves unchanged data
- Slower but safer

#### Match Field

Field used to find existing records (for UPDATE/UPSERT):
- `id` - Internal ID
- `slug` - URL slug
- `sku` - Stock Keeping Unit
- `code` - Code field
- `emailAddress` - Email (customers)

#### Conflict Resolution

When source and Vendure data differ:

**SOURCE_WINS:**
- Always use source data
- Overwrites Vendure values

**VENDURE_WINS:**
- Keep Vendure data
- Ignore source changes

**MERGE:**
- Update only changed fields
- Preserves other fields

**MANUAL_QUEUE:**
- Queue conflicts for review
- Requires manual approval

#### Validation Mode

**STRICT:**
- Enforce all validation rules
- Fail on any error

**LENIENT:**
- Allow some validation failures
- Continue with valid records

### Step 7: Configure Batching

Control import performance.

**Batch Size:**
- Number of records per batch
- Default: 100
- Range: 10-1000

**Concurrency:**
- Parallel batch processing
- Default: 2
- Range: 1-8

**Example Settings:**

| Scenario | Batch Size | Concurrency |
|----------|-----------|-------------|
| Small import (< 1000) | 100 | 2 |
| Large import (> 10,000) | 500 | 4 |
| Complex products | 50 | 2 |
| Simple customers | 200 | 4 |

### Step 8: Validation and Preview

Validate data before importing.

<p align="center">
  <img src="../images/import-wizard-validation.png" alt="Validation" width="700">
</p>

**Validation Checks:**
- Required fields present
- Data types correct
- Format validation (email, URL, etc.)
- Business rules (price > 0, etc.)
- Uniqueness constraints

**Preview Changes:**
- First 100 records
- Shows what will be created/updated
- Highlights validation errors

**Actions:**
- Fix errors in source data
- Adjust field mappings
- Change validation mode
- Proceed with import

### Step 9: Execute Import

Run the import and monitor progress.

<p align="center">
  <img src="../images/import-wizard-execution.png" alt="Execution" width="700">
</p>

**Progress Indicators:**
- Records processed
- Success count
- Error count
- Current batch
- Estimated time remaining

**Real-Time Logs:**
- Import started
- Batch completed
- Validation errors
- Import completed

**Actions During Import:**
- Pause import
- Cancel import (stops after current batch)
- View detailed logs

### Step 10: Review Results

View import results and handle errors.

<p align="center">
  <img src="../images/import-wizard-results.png" alt="Results" width="700">
</p>

**Summary:**
- Total records: 1000
- Successful: 950
- Failed: 50
- Skipped: 0

**Failed Records:**
- Download error report (CSV)
- View error details
- Fix and re-import

**Actions:**
- View imported entities
- Download audit log
- Start new import
- Save as template

## Export Wizard

Export Vendure data to files or external systems.

### Step 1: Choose Template

Select export template or create custom export.

**Available Templates:**
- Product Catalog (CSV)
- Customer List (XLSX)
- Order Report (JSON)
- Inventory Report (CSV)
- Price List (CSV)

### Step 2: Select Source Entity

Choose what to export.

**Available Entities:**
- All entities available for import
- Plus: Orders, Fulfillments, Payments

**Filters:**
Add filters to export subset of data:
- Date range
- Status
- Channel
- Custom fields
- Tags

**Example Filters:**
```
Entity: Product
Filters:
  - enabled = true
  - createdAt > 2024-01-01
  - tags contains 'featured'
```

### Step 3: Select Fields

Choose which fields to include in export.

<p align="center">
  <img src="../images/export-wizard-fields.png" alt="Field Selection" width="700">
</p>

**Field Selection:**
- Check fields to include
- Drag to reorder
- Rename field labels

**Related Entities:**
- Include variant fields
- Include asset URLs
- Include facet values
- Include custom fields

### Step 4: Configure Format

Choose output format and options.

#### CSV

**Options:**
- Delimiter (comma, semicolon, tab)
- Include header row
- Quote all fields
- Line ending (CRLF, LF)

#### JSON

**Options:**
- Pretty print
- Array format vs. NDJSON
- Include metadata

#### XML

**Options:**
- Root element name
- Row element name
- Include XML declaration

#### Excel (XLSX)

**Options:**
- Sheet name
- Freeze header row
- Column widths
- Number formats

### Step 5: Configure Destination

Choose where to send exported data.

#### Download

Export to browser download:
- Immediate download
- Temporary file (deleted after 24h)

#### File System

Save to server:
- Directory path
- Filename pattern
- Overwrite or append

#### FTP/SFTP

Upload to remote server:
- Connection
- Remote path
- Filename

#### S3

Upload to cloud storage:
- Connection
- Bucket
- Key prefix

#### Email

Send via email:
- Recipients
- Subject
- Body template
- Attachment name

### Step 6: Execute Export

Run export and download results.

**Progress:**
- Records exported
- File size
- Estimated time

**Actions:**
- Cancel export
- View preview
- Download partial results

### Step 7: Review and Download

Download exported file.

**Summary:**
- Records exported: 5,000
- File size: 2.5 MB
- Format: CSV
- Duration: 45 seconds

**Actions:**
- Download file
- Schedule recurring export
- Save as template
- Export again

## Templates

Save and reuse import/export configurations.

### Creating Templates

1. Complete wizard configuration
2. Click **Save as Template**
3. Enter template details:
   - Name
   - Description
   - Category
   - Visibility (Private/Shared)

### Using Templates

1. Start wizard
2. Select template
3. Optionally customize
4. Execute

### Managing Templates

Navigate to **Data Hub > Templates**

**Actions:**
- Edit template
- Delete template
- Duplicate template
- Share with team
- Export template (JSON)
- Import template

## Field Mapping

Advanced field mapping techniques.

### Default Values

Set default values for unmapped fields:

```
Field: enabled
Default: true
```

### Computed Values

Use expressions to compute values:

```
Field: slug
Expression: ${sku}.toLowerCase()
```

### Conditional Mapping

Map different sources based on conditions:

```
Field: price
If: has_sale_price
  Then: sale_price
  Else: regular_price
```

### Array Handling

Map array fields:

```
Source: tags (comma-separated)
Transform: Split by ','
Target: tags (array)
```

### Related Entity Lookup

Look up related entities:

```
Field: collection
Lookup: Collection
Match By: slug
Source Field: collection_slug
```

## Validation and Preview

### Validation Rules

**Built-in Rules:**
- Required fields
- Data types
- Format (email, URL, date)
- Min/Max values
- Uniqueness

**Custom Rules:**
Add custom JavaScript validation:

```javascript
// Validate SKU format
function validateSKU(value) {
    return /^[A-Z0-9-]{4,20}$/.test(value);
}
```

### Preview Changes

Before importing, preview what will happen:

**Created Records:**
- Shows new entities that will be created
- Highlights required fields
- Shows default values

**Updated Records:**
- Shows existing entities
- Highlights changed fields
- Shows before/after values

**Errors:**
- Validation failures
- Missing required fields
- Type mismatches

## Troubleshooting

### Common Issues

#### Issue: Import fails with "Required field missing"

**Solution:**
1. Check field mappings
2. Ensure required fields are mapped
3. Or set default values for required fields

#### Issue: "Duplicate key" error during import

**Solution:**
1. Check match field is correct
2. Verify source data has unique values
3. Or use CREATE strategy to skip duplicates

#### Issue: Slow import performance

**Solution:**
1. Increase batch size (500-1000)
2. Reduce concurrency if database is bottleneck
3. Disable validation in lenient mode
4. Import during off-peak hours

#### Issue: Some fields not updating

**Solution:**
1. Check conflict resolution strategy
2. Use SOURCE_WINS instead of VENDURE_WINS
3. Or use MERGE to update only changed fields

#### Issue: Date/time parsing errors

**Solution:**
1. Specify date format in transformation
2. Common formats:
   - `YYYY-MM-DD`
   - `DD/MM/YYYY`
   - `MM/DD/YYYY HH:mm:ss`

#### Issue: Export times out

**Solution:**
1. Add filters to reduce dataset
2. Export in smaller batches
3. Schedule export during off-peak hours
4. Increase export timeout in settings

### Getting Help

- Check [Troubleshooting Guide](../deployment/troubleshooting.md)
- Review import/export logs
- Contact support with:
  - Template configuration
  - Error messages
  - Sample data (anonymized)

## Best Practices

### Import Best Practices

1. **Start Small**
   - Test with 10-100 records first
   - Verify results before full import

2. **Validate First**
   - Always run validation
   - Fix errors before importing

3. **Use Templates**
   - Save successful configurations
   - Reuse for similar imports

4. **Backup Data**
   - Backup database before large imports
   - Export current data for rollback

5. **Monitor Progress**
   - Watch for errors during import
   - Pause if error rate is high

### Export Best Practices

1. **Use Filters**
   - Only export needed data
   - Reduces file size and time

2. **Schedule Large Exports**
   - Run during off-peak hours
   - Avoid impacting store performance

3. **Choose Appropriate Format**
   - CSV for tabular data
   - JSON for nested data
   - Excel for business users

4. **Secure Sensitive Data**
   - Encrypt exports containing PII
   - Use secure transfer methods (SFTP, S3)
   - Delete temporary files

## See Also

- [Templates Guide](./templates.md) - Pre-built templates
- [Operators Guide](../developer-guide/dsl/operators.md) - Field transformations
- [Performance Guide](../deployment/performance.md) - Optimization
- [Troubleshooting Guide](../deployment/troubleshooting.md) - Common issues
