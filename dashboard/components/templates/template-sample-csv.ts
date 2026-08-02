import type { ImportTemplate } from '../../hooks/use-import-templates';

function escapeCsvCell(value: unknown): string {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text)
        ? `"${text.replace(/"/g, '""')}"`
        : text;
}

export function buildTemplateSampleCsv(
    template: Pick<ImportTemplate, 'requiredFields' | 'optionalFields' | 'sampleData'>,
): string {
    const fields = [...template.requiredFields, ...template.optionalFields];
    const header = fields.map(escapeCsvCell).join(',');
    const rows = (template.sampleData ?? []).map(row =>
        fields.map(field => escapeCsvCell(row[field])).join(','),
    );
    return [header, ...rows].join('\n');
}
