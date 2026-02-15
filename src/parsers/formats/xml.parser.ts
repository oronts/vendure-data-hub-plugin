import { ParseResult, ParseError, XmlParseOptions } from '../types';
import { XML_PARSER } from '../../constants';
import { extractFields } from '../helpers/field-extraction';
import { getErrorMessage } from '../../utils/error.utils';

const DEFAULT_RECORD_TAGS: readonly string[] = XML_PARSER.DEFAULT_RECORD_TAGS;
const DEFAULT_ATTR_PREFIX = XML_PARSER.DEFAULT_ATTR_PREFIX;
const MAX_TAG_NAME_LENGTH = XML_PARSER.MAX_TAG_NAME_LENGTH;

/** Validates a tag name to prevent ReDoS and injection attacks */
function isValidTagName(tagName: string): boolean {
    // Check length to prevent ReDoS
    if (!tagName || tagName.length > MAX_TAG_NAME_LENGTH) {
        return false;
    }
    // Only allow alphanumeric, underscore, hyphen, and colon (for namespaces)
    return /^[a-zA-Z_][a-zA-Z0-9_\-:]*$/.test(tagName);
}

export function parseXmlElement(
    xml: string,
    attrPrefix: string = DEFAULT_ATTR_PREFIX,
): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};

    // Extract attributes from root element
    const rootMatch = xml.match(/^<([^\s>]+)([^>]*)>/);
    if (rootMatch) {
        const attrs = rootMatch[2];
        const attrRegex = /(\w+)=["']([^"']*)["']/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrs)) !== null) {
            result[attrPrefix + attrMatch[1]] = parseXmlValue(attrMatch[2]);
        }
    }

    // Extract child elements with simple values
    const childRegex = /<(\w+)(?:[^>]*)>([^<]*)<\/\1>/g;
    let childMatch;
    while ((childMatch = childRegex.exec(xml)) !== null) {
        const key = childMatch[1];
        const value = childMatch[2].trim();
        result[key] = parseXmlValue(value);
    }

    // Extract self-closing elements with attributes
    const selfClosingRegex = /<(\w+)\s+([^/>]+)\/>/g;
    let selfMatch;
    while ((selfMatch = selfClosingRegex.exec(xml)) !== null) {
        const tagName = selfMatch[1];
        const attrs = selfMatch[2];

        // Extract value attribute first
        const valueMatch = attrs.match(/value=["']([^"']*)["']/);
        if (valueMatch) {
            result[tagName] = parseXmlValue(valueMatch[1]);
        }
    }

    return Object.keys(result).length > 0 ? result : null;
}

function parseXmlValue(value: string): string | number | boolean | null {
    const trimmed = value.trim();

    // Empty value
    if (trimmed === '') return '';

    // Boolean
    if (trimmed.toLowerCase() === 'true') return true;
    if (trimmed.toLowerCase() === 'false') return false;

    // Null
    if (trimmed.toLowerCase() === 'null' || trimmed === 'nil') return null;

    // Number
    if (trimmed !== '' && !isNaN(Number(trimmed))) {
        return Number(trimmed);
    }

    return trimmed;
}

function extractRecords(
    content: string,
    tagNames: readonly string[],
    attrPrefix: string,
): Record<string, unknown>[] {
    const records: Record<string, unknown>[] = [];

    for (const tagName of tagNames) {
        // Validate tag name to prevent ReDoS attacks
        if (!isValidTagName(tagName)) {
            continue;
        }

        // Escape special regex characters in tag name (belt and suspenders after validation)
        const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Match both self-closing and content tags
        const regex = new RegExp(`<${escapedTagName}[^>]*(?:>[\\s\\S]*?<\\/${escapedTagName}>|\\/>)`, 'gi');
        let match;

        while ((match = regex.exec(content)) !== null) {
            const record = parseXmlElement(match[0], attrPrefix);
            if (record) {
                records.push(record);
            }
        }

        // Stop if we found records
        if (records.length > 0) break;
    }

    return records;
}

function parseRecordPath(recordPath?: string): readonly string[] {
    if (!recordPath) {
        return DEFAULT_RECORD_TAGS;
    }

    // Handle pipe-separated alternatives
    return recordPath
        .split('|')
        .map(p => p.replace(/^\/\//, '').split('/').pop() ?? '')
        .filter(Boolean);
}


export function parseXml(
    content: string,
    options: XmlParseOptions = {},
): ParseResult {
    const errors: ParseError[] = [];
    const warnings: string[] = [];

    try {
        const attrPrefix = options.attributePrefix ?? DEFAULT_ATTR_PREFIX;
        const tagNames = parseRecordPath(options.recordPath);

        const records = extractRecords(content, tagNames, attrPrefix);

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
            totalRows: records.length,
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
    // Skip XML declaration
    let xml = content.trim();
    if (xml.startsWith('<?xml')) {
        const endDecl = xml.indexOf('?>');
        if (endDecl !== -1) {
            xml = xml.slice(endDecl + 2).trim();
        }
    }

    // Skip comments
    while (xml.startsWith('<!--')) {
        const endComment = xml.indexOf('-->');
        if (endComment === -1) break;
        xml = xml.slice(endComment + 3).trim();
    }

    // Get root element name
    const rootMatch = xml.match(/^<(\w+)/);
    return rootMatch?.[1];
}

export function getChildElementNames(content: string): string[] {
    const root = getRootElement(content);
    if (!root || !isValidTagName(root)) return [];

    // Escape special regex characters in root element name
    const escapedRoot = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Find content inside root element
    const startTagRegex = new RegExp(`<${escapedRoot}[^>]*>`);
    const endTagRegex = new RegExp(`</${escapedRoot}>`);

    const startMatch = startTagRegex.exec(content);
    const endMatch = endTagRegex.exec(content);

    if (!startMatch || !endMatch) return [];

    const innerContent = content.slice(
        startMatch.index + startMatch[0].length,
        endMatch.index,
    );

    // Find all element names
    const names = new Set<string>();
    const elementRegex = /<(\w+)[\s>]/g;
    let match;

    while ((match = elementRegex.exec(innerContent)) !== null) {
        names.add(match[1]);
    }

    return Array.from(names);
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
