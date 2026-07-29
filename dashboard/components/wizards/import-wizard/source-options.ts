import type { LucideIcon } from 'lucide-react';
import { Globe, Upload } from 'lucide-react';
import { resolveIconName } from '../../../utils';

export const SMART_SOURCES = [
    {
        id: 'FILE',
        label: 'File upload',
        description: 'CSV, Excel, JSON, or XML',
    },
    {
        id: 'API',
        label: 'REST API',
        description: 'Fetch data from an HTTP endpoint',
    },
] as const;

export const SMART_SOURCE_ICONS: Record<string, LucideIcon> = {
    FILE: Upload,
    API: Globe,
};

const SMART_SOURCE_CODES = new Set([
    'csv',
    'json',
    'xml',
    'xlsx',
    'httpApi',
    'file',
]);

export interface ExtractorSourceMetadata {
    code: string;
    name?: string | null;
    description?: string | null;
    icon?: string | null;
    wizardHidden?: boolean | null;
}

export function getDynamicSourceOptions(
    extractors?: readonly ExtractorSourceMetadata[],
) {
    return (extractors ?? [])
        .filter(extractor =>
            !SMART_SOURCE_CODES.has(extractor.code)
            && extractor.wizardHidden !== true)
        .map(extractor => ({
            id: extractor.code,
            label: extractor.name ?? extractor.code,
            description: extractor.description ?? '',
            iconName: extractor.icon ?? undefined,
        }));
}

export function getAdapterCodeForSourceType(
    sourceType: string,
    extractors?: readonly Pick<ExtractorSourceMetadata, 'code'>[],
): string {
    const extractor = extractors?.find(candidate =>
        candidate.code.toUpperCase() === sourceType.toUpperCase());
    return extractor?.code ?? sourceType.toLowerCase();
}

export function resolveSourceIcon(
    sourceId: string,
    iconName: string | undefined,
    fallback: LucideIcon,
): LucideIcon {
    if (iconName) {
        const resolved = resolveIconName(iconName);
        if (resolved) return resolved;
    }
    return SMART_SOURCE_ICONS[sourceId] ?? fallback;
}
