import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { parse } from 'graphql';
import { CACHE_TIMES } from '../constants';
import { filterTemplates } from '../utils/template-helpers';
import { createQueryKeys } from '../utils/query-key-factory';

export interface ExportTemplate {
    id: string;
    name: string;
    description: string;
    icon?: string;
    format: string;
    requiredFields: string[];
    tags?: string[];
    featured?: boolean;
    definition?: {
        sourceEntity?: string;
        format?: string;
        formatOptions?: Record<string, unknown>;
        fields?: { sourceField: string; outputName: string }[];
        destinationType?: string;
    };
}

const exportTemplatesDocument = parse(`
    query DataHubExportTemplatesApi {
        dataHubExportTemplates {
            id
            name
            description
            icon
            format
            requiredFields
            tags
            definition
        }
    }
`);

const exportTemplateKeys = createQueryKeys('export-templates');

export interface UseExportTemplatesResult {
    templates: ExportTemplate[];
    getTemplateById: (id: string) => ExportTemplate | undefined;
    searchTemplates: (query: string) => ExportTemplate[];
    isLoading: boolean;
}

export function useExportTemplates(): UseExportTemplatesResult {
    const { data: templates = [], isLoading } = useQuery({
        queryKey: exportTemplateKeys.lists(),
        queryFn: () =>
            api.query(exportTemplatesDocument)
                .then((res: Record<string, unknown>) => {
                    const items = res?.dataHubExportTemplates;
                    return Array.isArray(items) ? items as ExportTemplate[] : [];
                })
                .catch(() => [] as ExportTemplate[]),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });

    const getTemplateById = React.useCallback(
        (id: string) => templates.find(t => t.id === id),
        [templates],
    );

    const searchTemplates = React.useCallback(
        (query: string) => filterTemplates(templates, query),
        [templates],
    );

    return {
        templates,
        getTemplateById,
        searchTemplates,
        isLoading,
    };
}
