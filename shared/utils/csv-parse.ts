/**
 * Lightweight CSV line parser respecting quoted fields.
 *
 * Used by the dashboard file-format registry for client-side CSV preview.
 * The backend `src/parsers/formats/csv.parser.ts` has a more feature-rich
 * version that supports custom quote/escape characters.
 */
export function parseCSVLine(line: string, delimiter = ','): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    return result;
}
