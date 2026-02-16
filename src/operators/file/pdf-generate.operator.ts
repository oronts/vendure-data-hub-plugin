import { AdapterDefinition, JsonObject, AdapterOperatorHelpers, OperatorResult } from '../types';

export const PDF_GENERATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'pdfGenerate',
    name: 'PDF Generate',
    description: 'Generate PDF from HTML template with record data',
    category: 'CONVERSION',
    version: '1.0.0',
    schema: {
        groups: [{ id: 'main', label: 'PDF Settings' }],
        fields: [
            { key: 'template', label: 'HTML Template', type: 'string', group: 'main', description: 'HTML template with {{field}} placeholders' },
            { key: 'templateField', label: 'Template Field', type: 'string', group: 'main', description: 'Record field containing HTML template' },
            { key: 'targetField', label: 'Target Field', type: 'string', required: true, group: 'main' },
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
    pageSize?: 'A4' | 'LETTER' | 'A3';
    orientation?: 'PORTRAIT' | 'LANDSCAPE';
}

/**
 * Simple template replacement: replaces {{fieldName}} with record values.
 */
function simpleTemplateReplace(template: string, data: JsonObject): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        const value = data[key];
        return value != null ? String(value) : '';
    });
}

/** Default font size in PDF points */
const DEFAULT_FONT_SIZE = 12;
/** Default page margin in PDF points */
const DEFAULT_MARGIN = 50;
/** Line spacing multiplier relative to font size */
const LINE_SPACING_MULTIPLIER = 1.5;

/** Page dimensions in PDF points (1 point = 1/72 inch) */
const PAGE_SIZES: Record<string, [number, number]> = {
    A4: [595.28, 841.89],
    LETTER: [612, 792],
    A3: [841.89, 1190.55],
};

/**
 * Minimal interface for the PDFDocument from pdf-lib.
 * Declared here to avoid requiring pdf-lib types at compile time,
 * since pdf-lib is an optional dependency loaded at runtime.
 */
interface PdfLibModule {
    PDFDocument: {
        create(): Promise<PdfDoc>;
    };
    StandardFonts: {
        Helvetica: string;
    };
}

interface PdfDoc {
    addPage(size: [number, number]): PdfPage;
    embedFont(font: string): Promise<PdfFont>;
    save(): Promise<Uint8Array>;
}

interface PdfPage {
    getSize(): { width: number; height: number };
    drawText(text: string, options: { x: number; y: number; size: number; font: PdfFont }): void;
}

interface PdfFont {
    widthOfTextAtSize(text: string, size: number): number;
}

async function loadPdfLib(): Promise<PdfLibModule> {
    try {
        // Use indirect require to avoid TypeScript module resolution for optional dependency
        const moduleName = 'pdf-lib';
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = await (Function('moduleName', 'return import(moduleName)')(moduleName)) as PdfLibModule;
        return mod;
    } catch {
        throw new Error(
            'The "pdf-lib" package is required for PDF generation. Install it with: npm install pdf-lib',
        );
    }
}

export async function pdfGenerateOperator(
    records: readonly JsonObject[],
    config: PdfGenerateConfig,
    _helpers: AdapterOperatorHelpers,
): Promise<OperatorResult> {
    const pdfLib = await loadPdfLib();
    const output: JsonObject[] = [];

    for (const record of records) {
        try {
            const templateStr = config.templateField
                ? String(record[config.templateField] ?? '')
                : (config.template ?? '');

            if (!templateStr) {
                output.push({ ...record });
                continue;
            }

            const renderedHtml = simpleTemplateReplace(templateStr, record);

            const pdfDoc = await pdfLib.PDFDocument.create();
            const pageDimensions = PAGE_SIZES[config.pageSize ?? 'A4'];
            const [width, height] = config.orientation === 'LANDSCAPE'
                ? [pageDimensions[1], pageDimensions[0]]
                : pageDimensions;
            const page = pdfDoc.addPage([width, height]);

            // Strip HTML tags for plain text PDF (pdf-lib does not render HTML)
            const plainText = renderedHtml.replace(/<[^>]*>/g, '').trim();
            const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
            const fontSize = DEFAULT_FONT_SIZE;
            const pageHeight = page.getSize().height;
            const margin = DEFAULT_MARGIN;
            const maxLineWidth = page.getSize().width - margin * 2;

            // Simple text rendering with basic line wrapping
            const lines = plainText.split('\n');
            let y = pageHeight - margin;
            for (const line of lines) {
                if (y < margin) break;

                // Basic word-wrapping
                const words = line.split(' ');
                let currentLine = '';
                for (const word of words) {
                    const testLine = currentLine ? `${currentLine} ${word}` : word;
                    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
                    if (testWidth > maxLineWidth && currentLine) {
                        page.drawText(currentLine, { x: margin, y, size: fontSize, font });
                        y -= fontSize * LINE_SPACING_MULTIPLIER;
                        currentLine = word;
                        if (y < margin) break;
                    } else {
                        currentLine = testLine;
                    }
                }
                if (y >= margin && currentLine) {
                    page.drawText(currentLine, { x: margin, y, size: fontSize, font });
                    y -= fontSize * LINE_SPACING_MULTIPLIER;
                }
            }

            const pdfBytes = await pdfDoc.save();
            const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
            output.push({ ...record, [config.targetField]: pdfBase64 });
        } catch (e: unknown) {
            // Log warning - keep original record on processing failure
            output.push({ ...record });
        }
    }

    return { records: output };
}
