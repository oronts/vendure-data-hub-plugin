import { AdapterDefinition, JsonObject } from '../types';
import {
    SplitOperatorConfig,
    JoinOperatorConfig,
    TrimOperatorConfig,
    CaseOperatorConfig,
    SlugifyOperatorConfig,
    ConcatOperatorConfig,
    ReplaceOperatorConfig,
    ExtractRegexOperatorConfig,
    ReplaceRegexOperatorConfig,
    StripHtmlOperatorConfig,
    TruncateOperatorConfig,
} from './types';
import {
    applySplit,
    applyJoin,
    applyTrim,
    applyLowercase,
    applyUppercase,
    applySlugify,
    applyConcat,
    applyReplace,
    applyExtractRegex,
    applyReplaceRegex,
    applyStripHtml,
    applyTruncate,
} from './helpers';
import { TRIM_MODES } from '../constants';
import { createRecordOperator } from '../operator-factory';

export const SPLIT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'split',
    description: 'Split a string field into an array by delimiter.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'delimiter', label: 'Delimiter', type: 'string', required: true, description: 'Character(s) to split by' },
            { key: 'trim', label: 'Trim items', type: 'boolean', description: 'Trim whitespace from each item' },
        ],
    },
};

export const JOIN_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'join',
    description: 'Join an array field into a string.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'delimiter', label: 'Delimiter', type: 'string', required: true, description: 'Character(s) to join with' },
        ],
    },
};

export const TRIM_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'trim',
    description: 'Trim whitespace from a string field.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            {
                key: 'mode', label: 'Mode', type: 'select', options: [...TRIM_MODES],
            },
        ],
    },
};

export const LOWERCASE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'lowercase',
    description: 'Convert a string field to lowercase.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
        ],
    },
};

export const UPPERCASE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'uppercase',
    description: 'Convert a string field to uppercase.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
        ],
    },
};

export const SLUGIFY_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'slugify',
    description: 'Generate a URL-friendly slug from a string field.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'separator', label: 'Separator', type: 'string', description: 'Default: hyphen (-)' },
        ],
    },
};

export const CONCAT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'concat',
    description: 'Concatenate multiple string fields into one.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'sources', label: 'Source field paths (JSON array)', type: 'json', required: true, description: 'Array of field paths to concatenate' },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'separator', label: 'Separator', type: 'string', description: 'Optional separator between values' },
        ],
    },
};

export const REPLACE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'replace',
    description: 'Replace text in a string field.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            { key: 'search', label: 'Search text', type: 'string', required: true },
            { key: 'replacement', label: 'Replacement', type: 'string', required: true },
            { key: 'all', label: 'Replace all occurrences', type: 'boolean' },
        ],
    },
};

export function applySplitOperator(record: JsonObject, config: SplitOperatorConfig): JsonObject {
    return applySplit(record, config.source, config.target, config.delimiter, config.trim);
}

export const splitOperator = createRecordOperator(applySplitOperator);

export function applyJoinOperator(record: JsonObject, config: JoinOperatorConfig): JsonObject {
    return applyJoin(record, config.source, config.target, config.delimiter);
}

export const joinOperator = createRecordOperator(applyJoinOperator);

export function applyTrimOperator(record: JsonObject, config: TrimOperatorConfig): JsonObject {
    return applyTrim(record, config.path, config.mode);
}

export const trimOperator = createRecordOperator(applyTrimOperator);

export function applyLowercaseOperator(record: JsonObject, config: CaseOperatorConfig): JsonObject {
    return applyLowercase(record, config.path);
}

export const lowercaseOperator = createRecordOperator(applyLowercaseOperator);

export function applyUppercaseOperator(record: JsonObject, config: CaseOperatorConfig): JsonObject {
    return applyUppercase(record, config.path);
}

export const uppercaseOperator = createRecordOperator(applyUppercaseOperator);

export function applySlugifyOperator(record: JsonObject, config: SlugifyOperatorConfig): JsonObject {
    return applySlugify(record, config.source, config.target, config.separator);
}

export const slugifyOperator = createRecordOperator(applySlugifyOperator);

export function applyConcatOperator(record: JsonObject, config: ConcatOperatorConfig): JsonObject {
    return applyConcat(record, config.sources, config.target, config.separator);
}

export const concatOperator = createRecordOperator(applyConcatOperator);

export function applyReplaceOperator(record: JsonObject, config: ReplaceOperatorConfig): JsonObject {
    return applyReplace(record, config.path, config.search, config.replacement, config.all);
}

export const replaceOperator = createRecordOperator(applyReplaceOperator);

export const EXTRACT_REGEX_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'extractRegex',
    description: 'Extract a value from a string field using a regular expression pattern with capture groups.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', required: true },
            { key: 'pattern', label: 'Regex pattern', type: 'string', required: true, description: 'Regular expression pattern (without delimiters)' },
            { key: 'group', label: 'Capture group', type: 'number', description: 'Group index to extract (0=full match, 1+=capture groups). Default: 1' },
            { key: 'flags', label: 'Regex flags', type: 'string', description: 'e.g., "i" for case-insensitive' },
        ],
    },
};

export const REPLACE_REGEX_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'replaceRegex',
    description: 'Replace values in a string field using a regular expression pattern.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            { key: 'pattern', label: 'Regex pattern', type: 'string', required: true, description: 'Regular expression pattern (without delimiters)' },
            { key: 'replacement', label: 'Replacement', type: 'string', required: true, description: 'Replacement string (use $1, $2 for capture groups)' },
            { key: 'flags', label: 'Regex flags', type: 'string', description: 'e.g., "gi" for global case-insensitive. Default: "g"' },
        ],
    },
};

export function applyExtractRegexOperator(record: JsonObject, config: ExtractRegexOperatorConfig): JsonObject {
    if (!config.source || !config.target || !config.pattern) {
        return record;
    }
    return applyExtractRegex(record, config.source, config.target, config.pattern, config.group, config.flags);
}

export const extractRegexOperator = createRecordOperator(applyExtractRegexOperator);

export function applyReplaceRegexOperator(record: JsonObject, config: ReplaceRegexOperatorConfig): JsonObject {
    if (!config.path || !config.pattern || config.replacement === undefined) {
        return record;
    }
    return applyReplaceRegex(record, config.path, config.pattern, config.replacement, config.flags);
}

export const replaceRegexOperator = createRecordOperator(applyReplaceRegexOperator);

export const STRIP_HTML_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'stripHtml',
    name: 'Strip HTML',
    description: 'Remove HTML tags from a string field, preserving text content.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    fieldTransform: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
        ],
    },
};

export const TRUNCATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'OPERATOR',
    code: 'truncate',
    description: 'Truncate a string to a maximum length, optionally adding a suffix.',
    category: 'STRING',
    categoryLabel: 'String',
    categoryOrder: 1,
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
            { key: 'length', label: 'Maximum length', type: 'number', required: true },
            { key: 'suffix', label: 'Suffix when truncated', type: 'string', description: 'e.g., "..." (default: none)' },
        ],
    },
};

export function applyStripHtmlOperator(record: JsonObject, config: StripHtmlOperatorConfig): JsonObject {
    if (!config.source) {
        return record;
    }
    return applyStripHtml(record, config.source, config.target);
}

export const stripHtmlOperator = createRecordOperator(applyStripHtmlOperator);

export function applyTruncateOperator(record: JsonObject, config: TruncateOperatorConfig): JsonObject {
    if (!config.source || config.length === undefined) {
        return record;
    }
    return applyTruncate(record, config.source, config.target, config.length, config.suffix);
}

export const truncateOperator = createRecordOperator(applyTruncateOperator);
