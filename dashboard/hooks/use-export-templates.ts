import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../gql';
import { CACHE_TIMES } from '../constants';
import { filterTemplates } from '../utils/template-helpers';
import { createQueryKeys } from '../utils/query-key-factory';
import { useExportEntitySchemas } from './api/use-export-entity-schemas';
import { normalizeExportTemplate } from '../utils/export-template-normalization';
import type { NormalizedExportTemplate } from '../utils/export-template-normalization';
import { useDynamicMetadataTranslations } from './use-dynamic-metadata-translations';

export type ExportTemplate = NormalizedExportTemplate;

const exportTemplatesDocument = graphql(`
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
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
}

export function useExportTemplates(): UseExportTemplatesResult {
    const exportEntities = useExportEntitySchemas();
    const { translateExportTemplate } = useDynamicMetadataTranslations();
    const query = useQuery({
        queryKey: exportTemplateKeys.lists(),
        queryFn: () =>
            api.query(exportTemplatesDocument)
                .then(res => res.dataHubExportTemplates.map(normalizeExportTemplate)),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
    const templates = React.useMemo(
        () => (query.data ?? [])
            .filter(template => {
                const sourceEntity = template.definition?.sourceEntity;
                return !sourceEntity || exportEntities.schemaMap.has(sourceEntity);
            })
            .map(template => ({
                ...template,
                name: translateExportTemplate(template.id, 'name', template.name),
                description: translateExportTemplate(
                    template.id,
                    'description',
                    template.description,
                ),
            })),
        [exportEntities.schemaMap, query.data, translateExportTemplate],
    );

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
        isLoading: query.isLoading || exportEntities.isLoading,
        isPending: query.isPending || exportEntities.isPending,
        isError: query.isError || exportEntities.isError,
        error: query.error ?? exportEntities.error,
        refetch: async () => Promise.all([query.refetch(), exportEntities.refetch()]),
    };
}
