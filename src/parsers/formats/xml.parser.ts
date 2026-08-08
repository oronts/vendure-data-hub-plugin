import { ParseResult, ParseError, XmlParseOptions } from '../types';
import { XML_PARSER } from '../../constants/defaults/parsers-defaults';
import { extractFields } from '../helpers/field-extraction';
import { getErrorMessage } from '../../utils/error.utils';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const DEFAULT_RECORD_TAGS: readonly string[] = XML_PARSER.DEFAULT_RECORD_TAGS;
const DEFAULT_ATTR_PREFIX = XML_PARSER.DEFAULT_ATTR_PREFIX;

interface ElementMatch {
    readonly name: string;
    readonly value: unknown;
}

interface RecordPath {
    readonly descendant: boolean;
    readonly segments: readonly string[];
}

function parseXmlValue(value: string): string | number | boolean | null {
    const trimmed = value.trim();

    // Empty value
    if (trimmed === '') return '';

    const lower = trimmed.toLowerCase();

    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null' || lower === 'nil') return null;

    if (!isNaN(Number(trimmed))) {
        return Number(trimmed);
    }

    return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeXmlValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return parseXmlValue(value);
    }
    if (Array.isArray(value)) {
        return value.map(normalizeXmlValue);
    }
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.entries(value).map(([key, child]) => [
                key,
                normalizeXmlValue(child),
            ]),
        );
    }
    return value;
}

function createXmlParser(attrPrefix: string): XMLParser {
    return new XMLParser({
        attributeNamePrefix: attrPrefix,
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        processEntities: true,
        removeNSPrefix: false,
        trimValues: true,
    });
}

function parseDocument(
    content: string,
    attrPrefix: string,
): Record<string, unknown> {
    const document: unknown = createXmlParser(attrPrefix).parse(content);
    return isRecord(document)
        ? normalizeXmlValue(document) as Record<string, unknown>
        : {};
}

function expandMatch(name: string, value: unknown): ElementMatch[] {
    return Array.isArray(value)
        ? value.map(item => ({ name, value: item }))
        : [{ name, value }];
}

function matchesElementName(actual: string, requested: string): boolean {
    if (actual === requested) {
        return true;
    }
    return !requested.includes(':') && actual.split(':').at(-1) === requested;
}

function findDirectMatches(value: unknown, segment: string): ElementMatch[] {
    if (Array.isArray(value)) {
        return value.flatMap(item => findDirectMatches(item, segment));
    }
    if (!isRecord(value)) {
        return [];
    }

    return Object.entries(value).flatMap(([name, child]) =>
        matchesElementName(name, segment) ? expandMatch(name, child) : [],
    );
}

function followPath(
    value: unknown,
    segments: readonly string[],
): ElementMatch[] {
    let matches: ElementMatch[] = [{ name: '', value }];

    for (const segment of segments) {
        matches = matches.flatMap(match =>
            findDirectMatches(match.value, segment),
        );
        if (matches.length === 0) {
            break;
        }
    }

    return matches;
}

function findDescendantMatches(
    value: unknown,
    segments: readonly string[],
): ElementMatch[] {
    if (segments.length === 0) {
        return [];
    }

    const matches: ElementMatch[] = [];

    const visit = (candidate: unknown): void => {
        if (Array.isArray(candidate)) {
            candidate.forEach(visit);
            return;
        }
        if (!isRecord(candidate)) {
            return;
        }

        for (const [name, child] of Object.entries(candidate)) {
            if (matchesElementName(name, segments[0])) {
                const initialMatches = expandMatch(name, child);
                matches.push(
                    ...(segments.length === 1
                        ? initialMatches
                        : initialMatches.flatMap(match =>
                            followPath(match.value, segments.slice(1)),
                        )),
                );
            }
            visit(child);
        }
    };

    visit(value);
    return matches;
}

function parseRecordPaths(recordPath?: string): readonly RecordPath[] {
    if (!recordPath) {
        return DEFAULT_RECORD_TAGS.map(tagName => ({
            descendant: true,
            segments: [tagName],
        }));
    }

    return recordPath
        .split('|')
        .map(path => path.trim())
        .filter(Boolean)
        .map(path => ({
            descendant: path.startsWith('//'),
            segments: path
                .replace(/^\.?\/+/, '')
                .split(/[/.]/)
                .map(segment => segment.trim())
                .filter(Boolean),
        }))
        .filter(path => path.segments.length > 0);
}

function toRecord(match: ElementMatch): Record<string, unknown> {
    return isRecord(match.value)
        ? match.value
        : { [match.name]: match.value };
}

function extractRecords(
    document: Record<string, unknown>,
    paths: readonly RecordPath[],
): Record<string, unknown>[] {
    for (const path of paths) {
        const matches = path.descendant
            ? findDescendantMatches(document, path.segments)
            : followPath(document, path.segments);
        if (matches.length > 0) {
            return matches.map(toRecord);
        }
    }

    return [];
}

function getRootMatch(
    document: Record<string, unknown>,
): ElementMatch | undefined {
    const root = Object.entries(document)[0];
    return root ? { name: root[0], value: root[1] } : undefined;
}

export function parseXmlElement(
    xml: string,
    attrPrefix: string = DEFAULT_ATTR_PREFIX,
): Record<string, unknown> | null {
    try {
        const root = getRootMatch(parseDocument(xml, attrPrefix));
        return root ? toRecord(root) : null;
    } catch {
        return null;
    }
}


export function parseXml(
    content: string,
    options: XmlParseOptions = {},
): ParseResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
        const validation = XMLValidator.validate(content);
        if (validation !== true) {
            return {
                success: false,
                format: 'XML' as const,
                records: [],
                fields: [],
                totalRows: 0,
                errors: [{ message: validation.err.msg }],
                warnings: [],
            };
        }
        const attrPrefix = options.attributePrefix ?? DEFAULT_ATTR_PREFIX;
        const document = parseDocument(content, attrPrefix);
        const paths = parseRecordPaths(options.recordPath);

        const extractedRecords = extractRecords(document, paths);
        const previewLimit = options.preview === undefined || !Number.isFinite(options.preview)
            ? undefined
            : Math.max(1, Math.floor(options.preview));
        const records = previewLimit === undefined
            ? extractedRecords
            : extractedRecords.slice(0, previewLimit);

        if (records.length === 0) {
            if (options.recordPath) {
                warnings.push(`No records found matching path: "${options.recordPath}"`);
            } else {
                warnings.push(`No records found. Searched for: ${DEFAULT_RECORD_TAGS.join(', ')}`);
                warnings.push('Try specifying recordPath option');
            }
        }

        const fields = extractFields(records);

        return {
            success: true,
            format: 'XML' as const,
            records,
            fields,
            totalRows: extractedRecords.length,
            errors,
            warnings,
        };
    } catch (err) {
        return {
            success: false,
            format: 'XML' as const,
            records: [],
            fields: [],
            totalRows: 0,
            errors: [{ message: getErrorMessage(err) }],
            warnings: [],
        };
    }
}

export function isXml(content: string): boolean {
    const trimmed = content.trim();
    return trimmed.startsWith('<?xml') || trimmed.startsWith('<');
}

export function getRootElement(content: string): string | undefined {
    try {
        return getRootMatch(parseDocument(content, DEFAULT_ATTR_PREFIX))?.name;
    } catch {
        return undefined;
    }
}

export function getChildElementNames(content: string): string[] {
    try {
        const root = getRootMatch(parseDocument(content, DEFAULT_ATTR_PREFIX));
        if (!root || !isRecord(root.value)) {
            return [];
        }
        return Object.keys(root.value).filter(
            name => name !== '#text' && !name.startsWith(DEFAULT_ATTR_PREFIX),
        );
    } catch {
        return [];
    }
}

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function generateXml(
    records: Record<string, unknown>[],
    options: {
        rootElement?: string;
        recordElement?: string;
        declaration?: boolean;
        indent?: number;
    } = {},
): string {
    const rootElement = options.rootElement ?? 'root';
    const recordElement = options.recordElement ?? 'item';
    const indent = options.indent ?? 2;
    const space = ' '.repeat(indent);

    let xml = '';

    if (options.declaration !== false) {
        xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
    }

    xml += `<${rootElement}>\n`;

    for (const record of records) {
        xml += `${space}<${recordElement}>\n`;

        for (const [key, value] of Object.entries(record)) {
            // Skip attributes (prefixed keys)
            if (key.startsWith('@')) continue;

            const escapedValue = value == null ? '' : escapeXml(String(value));
            xml += `${space}${space}<${key}>${escapedValue}</${key}>\n`;
        }

        xml += `${space}</${recordElement}>\n`;
    }

    xml += `</${rootElement}>`;

    return xml;
}
