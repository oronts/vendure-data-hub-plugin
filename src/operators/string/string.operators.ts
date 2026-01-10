import { AdapterDefinition, JsonObject, OperatorHelpers, OperatorResult } from '../types';
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

export const SPLIT_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'split',
    description: 'Split a string field into an array by delimiter.',
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
    type: 'operator',
    code: 'join',
    description: 'Join an array field into a string.',
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
    type: 'operator',
    code: 'trim',
    description: 'Trim whitespace from a string field.',
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
            {
                key: 'mode', label: 'Mode', type: 'select', options: [
                    { value: 'both', label: 'Both ends' },
                    { value: 'start', label: 'Start only' },
                    { value: 'end', label: 'End only' },
                ],
            },
        ],
    },
};

export const LOWERCASE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'lowercase',
    description: 'Convert a string field to lowercase.',
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
        ],
    },
};

export const UPPERCASE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'uppercase',
    description: 'Convert a string field to uppercase.',
    pure: true,
    schema: {
        fields: [
            { key: 'path', label: 'Field path', type: 'string', required: true },
        ],
    },
};

export const SLUGIFY_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'slugify',
    description: 'Generate a URL-friendly slug from a string field.',
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
    type: 'operator',
    code: 'concat',
    description: 'Concatenate multiple string fields into one.',
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
    type: 'operator',
    code: 'replace',
    description: 'Replace text in a string field.',
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

export function splitOperator(
    records: readonly JsonObject[],
    config: SplitOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applySplit(record, config.source, config.target, config.delimiter, config.trim),
    );
    return { records: results };
}

export function joinOperator(
    records: readonly JsonObject[],
    config: JoinOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyJoin(record, config.source, config.target, config.delimiter),
    );
    return { records: results };
}

export function trimOperator(
    records: readonly JsonObject[],
    config: TrimOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyTrim(record, config.path, config.mode),
    );
    return { records: results };
}

export function lowercaseOperator(
    records: readonly JsonObject[],
    config: CaseOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record => applyLowercase(record, config.path));
    return { records: results };
}

export function uppercaseOperator(
    records: readonly JsonObject[],
    config: CaseOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record => applyUppercase(record, config.path));
    return { records: results };
}

export function slugifyOperator(
    records: readonly JsonObject[],
    config: SlugifyOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applySlugify(record, config.source, config.target, config.separator),
    );
    return { records: results };
}

export function concatOperator(
    records: readonly JsonObject[],
    config: ConcatOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyConcat(record, config.sources, config.target, config.separator),
    );
    return { records: results };
}

export function replaceOperator(
    records: readonly JsonObject[],
    config: ReplaceOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    const results = records.map(record =>
        applyReplace(record, config.path, config.search, config.replacement, config.all),
    );
    return { records: results };
}

/**
 * Operator definition for extracting values using regex patterns.
 */
export const EXTRACT_REGEX_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'extractRegex',
    description: 'Extract a value from a string field using a regular expression pattern with capture groups.',
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

/**
 * Operator definition for replacing values using regex patterns.
 */
export const REPLACE_REGEX_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'replaceRegex',
    description: 'Replace values in a string field using a regular expression pattern.',
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

/**
 * Extract a value from a string using regex pattern with capture groups.
 */
export function extractRegexOperator(
    records: readonly JsonObject[],
    config: ExtractRegexOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || !config.target || !config.pattern) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyExtractRegex(
            record,
            config.source,
            config.target,
            config.pattern,
            config.group,
            config.flags,
        ),
    );
    return { records: results };
}

/**
 * Replace values in a string using regex pattern.
 */
export function replaceRegexOperator(
    records: readonly JsonObject[],
    config: ReplaceRegexOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.path || !config.pattern || config.replacement === undefined) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyReplaceRegex(
            record,
            config.path,
            config.pattern,
            config.replacement,
            config.flags,
        ),
    );
    return { records: results };
}

export const STRIP_HTML_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'stripHtml',
    description: 'Remove HTML tags from a string field, preserving text content.',
    pure: true,
    schema: {
        fields: [
            { key: 'source', label: 'Source field path', type: 'string', required: true },
            { key: 'target', label: 'Target field path', type: 'string', description: 'Defaults to source if not set' },
        ],
    },
};

export const TRUNCATE_OPERATOR_DEFINITION: AdapterDefinition = {
    type: 'operator',
    code: 'truncate',
    description: 'Truncate a string to a maximum length, optionally adding a suffix.',
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

export function stripHtmlOperator(
    records: readonly JsonObject[],
    config: StripHtmlOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyStripHtml(record, config.source, config.target),
    );
    return { records: results };
}

export function truncateOperator(
    records: readonly JsonObject[],
    config: TruncateOperatorConfig,
    helpers: OperatorHelpers,
): OperatorResult {
    if (!config.source || config.length === undefined) {
        return { records: [...records] };
    }

    const results = records.map(record =>
        applyTruncate(record, config.source, config.target, config.length, config.suffix),
    );
    return { records: results };
}
