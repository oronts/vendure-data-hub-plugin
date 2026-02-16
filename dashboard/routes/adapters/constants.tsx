import * as React from 'react';
import { Database, Cog, Upload } from 'lucide-react';

export const ADAPTER_TYPE_INFO = {
    EXTRACTOR: {
        label: 'Extractors',
        description: 'Pull data from external sources (APIs, databases, files)',
        icon: <Database className="w-5 h-5" />,
        color: 'bg-blue-100 text-blue-800',
    },
    OPERATOR: {
        label: 'Operators',
        description: 'Transform, filter, and enrich data during processing',
        icon: <Cog className="w-5 h-5" />,
        color: 'bg-purple-100 text-purple-800',
    },
    LOADER: {
        label: 'Loaders',
        description: 'Write data to destinations (Vendure, files, external APIs)',
        icon: <Upload className="w-5 h-5" />,
        color: 'bg-green-100 text-green-800',
    },
};

export const ADAPTERS_TABLE_PAGE_SIZE = 25;

export function guessExampleValue(
    type: string,
    options?: Array<{ value: string; label: string }> | null,
): unknown {
    if (options && options.length > 0) {
        return options[0].value;
    }
    switch (type) {
        case 'number':
            return 1000;
        case 'boolean':
            return true;
        case 'select':
            return 'value';
        case 'json':
            return {};
        case 'array':
            return [];
        default:
            return 'value';
    }
}
