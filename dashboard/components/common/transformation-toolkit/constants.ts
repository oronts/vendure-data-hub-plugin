import {
    Shuffle,
    Filter,
    Calculator,
    GitMerge,
    Layers,
    Braces,
    List,
    Copy,
    ArrowDown,
    Type,
    Hash,
} from 'lucide-react';
import type { TransformationType } from './types';

// =============================================================================
// TRANSFORM TEMPLATES
// =============================================================================

export const TRANSFORM_TEMPLATES: Array<{
    type: TransformationType;
    name: string;
    description: string;
    icon: React.FC<{ className?: string }>;
    color: string;
}> = [
    { type: 'map', name: 'Map Fields', description: 'Rename and reorganize fields', icon: Shuffle, color: 'bg-violet-500' },
    { type: 'filter', name: 'Filter Rows', description: 'Keep rows matching conditions', icon: Filter, color: 'bg-blue-500' },
    { type: 'formula', name: 'Formula', description: 'Calculate new field values', icon: Calculator, color: 'bg-amber-500' },
    { type: 'merge', name: 'Merge Fields', description: 'Combine multiple fields', icon: GitMerge, color: 'bg-emerald-500' },
    { type: 'split', name: 'Split Field', description: 'Split field into multiple', icon: Layers, color: 'bg-lime-500' },
    { type: 'aggregate', name: 'Aggregate', description: 'Group and summarize data', icon: Braces, color: 'bg-rose-500' },
    { type: 'lookup', name: 'Lookup', description: 'Join with reference data', icon: List, color: 'bg-sky-500' },
    { type: 'dedupe', name: 'Deduplicate', description: 'Remove duplicate rows', icon: Copy, color: 'bg-stone-500' },
    { type: 'sort', name: 'Sort', description: 'Order rows by field', icon: ArrowDown, color: 'bg-indigo-500' },
    { type: 'rename', name: 'Rename Fields', description: 'Bulk rename field names', icon: Type, color: 'bg-pink-500' },
    { type: 'typecast', name: 'Type Cast', description: 'Convert field types', icon: Hash, color: 'bg-orange-500' },
];

// =============================================================================
// FORMULA FUNCTIONS REFERENCE
// =============================================================================

export const FORMULA_FUNCTIONS = [
    { category: 'Math', functions: [
        { name: 'round(value, decimals?)', description: 'Round number to decimals' },
        { name: 'floor(value)', description: 'Round down to integer' },
        { name: 'ceil(value)', description: 'Round up to integer' },
        { name: 'abs(value)', description: 'Absolute value' },
        { name: 'min(a, b)', description: 'Minimum of two values' },
        { name: 'max(a, b)', description: 'Maximum of two values' },
    ]},
    { category: 'String', functions: [
        { name: 'upper(text)', description: 'Convert to uppercase' },
        { name: 'lower(text)', description: 'Convert to lowercase' },
        { name: 'trim(text)', description: 'Remove whitespace' },
        { name: 'concat(a, b, ...)', description: 'Join strings' },
        { name: 'substring(text, start, length?)', description: 'Extract substring' },
        { name: 'replace(text, find, replace)', description: 'Replace text' },
        { name: 'split(text, delimiter)', description: 'Split into array' },
    ]},
    { category: 'Date', functions: [
        { name: 'now()', description: 'Current timestamp' },
        { name: 'formatDate(date, format)', description: 'Format date string' },
        { name: 'parseDate(text, format)', description: 'Parse date from string' },
        { name: 'addDays(date, days)', description: 'Add days to date' },
    ]},
    { category: 'Logic', functions: [
        { name: 'if(condition, then, else)', description: 'Conditional value' },
        { name: 'coalesce(a, b, ...)', description: 'First non-null value' },
        { name: 'isNull(value)', description: 'Check if null' },
        { name: 'isEmpty(value)', description: 'Check if empty' },
    ]},
    { category: 'Conversion', functions: [
        { name: 'toNumber(value)', description: 'Convert to number' },
        { name: 'toString(value)', description: 'Convert to string' },
        { name: 'toBoolean(value)', description: 'Convert to boolean' },
        { name: 'toArray(value)', description: 'Wrap in array' },
    ]},
];
