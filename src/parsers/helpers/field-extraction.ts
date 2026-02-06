/**
 * DataHub Parsers - Field Extraction Utilities
 *
 * Shared utilities for extracting field information from parsed records.
 */

/**
 * Extract all unique field names from an array of records
 *
 * @param records - Array of records to analyze
 * @returns Array of unique field names
 */
export function extractFields(records: Record<string, unknown>[]): string[] {
    const fieldSet = new Set<string>();

    for (const record of records) {
        if (record && typeof record === 'object') {
            for (const key of Object.keys(record)) {
                fieldSet.add(key);
            }
        }
    }

    return Array.from(fieldSet);
}
