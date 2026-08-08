import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';
import { deepClone, getNestedValue, setNestedValue } from '../helpers';
import { getErrorMessage } from '../../utils/error.utils';

export const PDF_GENERATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'pdfGenerate',
    name: 'PDF Generate',
    description: 'Generate a plain-text PDF from a template and record data.',
    category: 'CONVERSION',
    categoryLabel: 'File',
    categoryOrder: 9,
    version: '1.0.0',
    wizardHidden: true,
    schema: {
        groups: [{ id: 'main', label: 'PDF Settings' }],
        fields: [
            { key: 'template', label: 'Text Template', type: 'string', group: 'main', description: 'Text with {{field.path}} placeholders. HTML tags are removed.' },
            { key: 'templateField', label: 'Template Field Path', type: 'string', group: 'main', description: 'Record field path containing the text template.' },
            { key: 'targetField', label: 'Target Field Path', type: 'string', required: true, group: 'main' },
            {
                key: 'pageSize', label: 'Page Size', type: 'select', group: 'main', options: [
                    { value: 'A4', label: 'A4' },
                    { value: 'LETTER', label: 'Letter' },
                    { value: 'A3', label: 'A3' },
                ],
            },
            {
                key: 'orientation', label: 'Orientation', type: 'select', group: 'main', options: [
                    { value: 'PORTRAIT', label: 'Portrait' },
                    { value: 'LANDSCAPE', label: 'Landscape' },
                ],
            },
        ],
    },
};

interface PdfGenerateConfig {
    templateField?: string;
    template?: string;
    targetField: string;
    pageSize?: keyof typeof PAGE_SIZES;
    orientation?: 'PORTRAIT' | 'LANDSCAPE';
}

const DEFAULT_FONT_SIZE = 12;
const DEFAULT_MARGIN = 50;
const LINE_HEIGHT = DEFAULT_FONT_SIZE * 1.5;

const PAGE_SIZES = {
    A4: [595.28, 841.89],
    LETTER: [612, 792],
    A3: [841.89, 1190.55],
} as const;

function replaceTemplateFields(template: string, data: JsonObject): string {
    return template.replace(/\{\{([\w.]+)\}\}/g, (_match, path: string) => {
        const value = getNestedValue(data, path);
        return value == null ? '' : String(value);
    });
}

function toPlainText(value: string): string {
    return value
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();
}

function wrapLine(line: string, font: PDFFont, maxWidth: number): string[] {
    const wrapped: string[] = [];
    let current = '';
    for (const word of line.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && font.widthOfTextAtSize(candidate, DEFAULT_FONT_SIZE) > maxWidth) {
            wrapped.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    wrapped.push(current);
    return wrapped;
}

function pageDimensions(config: PdfGenerateConfig): [number, number] {
    const dimensions = PAGE_SIZES[config.pageSize ?? 'A4'];
    return config.orientation === 'LANDSCAPE'
        ? [dimensions[1], dimensions[0]]
        : [dimensions[0], dimensions[1]];
}

function renderPages(pdf: PDFDocument, font: PDFFont, text: string, size: [number, number]): void {
    const [width, height] = size;
    const maxWidth = width - DEFAULT_MARGIN * 2;
    let page = pdf.addPage(size);
    let y = height - DEFAULT_MARGIN;

    for (const sourceLine of text.split('\n')) {
        for (const line of wrapLine(sourceLine, font, maxWidth)) {
            if (y < DEFAULT_MARGIN) {
                page = pdf.addPage(size);
                y = height - DEFAULT_MARGIN;
            }
            if (line) {
                page.drawText(line, {
                    x: DEFAULT_MARGIN,
                    y,
                    size: DEFAULT_FONT_SIZE,
                    font,
                });
            }
            y -= LINE_HEIGHT;
        }
    }
}

export async function pdfGenerateOperator(
    records: readonly JsonObject[],
    config: PdfGenerateConfig,
    _helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
    const output: JsonObject[] = [];
    const errors: NonNullable<OperatorResult['errors']> = [];

    for (const [index, record] of records.entries()) {
        const result = deepClone(record);
        try {
            const fieldTemplate = config.templateField
                ? getNestedValue(record, config.templateField)
                : undefined;
            const template = fieldTemplate === undefined ? config.template ?? '' : String(fieldTemplate);
            if (template) {
                const pdf = await PDFDocument.create();
                const font = await pdf.embedFont(StandardFonts.Helvetica);
                const text = toPlainText(replaceTemplateFields(template, record));
                renderPages(pdf, font, text, pageDimensions(config));
                setNestedValue(result, config.targetField, Buffer.from(await pdf.save()).toString('base64'));
            }
        } catch (error) {
            errors.push({
                message: getErrorMessage(error),
                field: config.templateField ?? 'template',
                index,
            });
        }
        output.push(result);
    }

    return {
        records: output,
        ...(errors.length > 0 ? { errors } : {}),
    };
}
