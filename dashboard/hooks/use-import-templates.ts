import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { parse } from 'graphql';
import type { TemplateCategory } from '../types';
import { CACHE_TIMES } from '../constants';
import { filterTemplates } from '../utils/template-helpers';
import { createQueryKeys } from '../utils/query-key-factory';

export interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon?: string;
    requiredFields: string[];
    optionalFields: string[];
    sampleData?: Record<string, unknown>[];
    featured?: boolean;
    tags?: string[];
    formats?: string[];
    definition?: {
        sourceType?: string;
        fileFormat?: string;
        targetEntity?: string;
        existingRecords?: string;
        lookupFields?: string[];
        fieldMappings?: { sourceField: string; targetField: string }[];
    };
}

export interface CategoryInfo {
    category: TemplateCategory;
    label: string;
    description: string;
    icon: string;
    count: number;
}

const importTemplatesDocument = parse(`
    query DataHubImportTemplatesApi {
        dataHubImportTemplates {
            id
            name
            description
            category
            icon
            requiredFields
            optionalFields
            sampleData
            featured
            tags
            formats
            definition
        }
    }
`);

const importTemplateCategoriesDocument = parse(`
    query DataHubImportTemplateCategoriesApi {
        dataHubImportTemplateCategories {
            category
            label
            description
            icon
            count
        }
    }
`);

const base = createQueryKeys('import-templates');
const importTemplateKeys = {
    ...base,
    categories: () => [...base.all, 'categories'] as const,
};

export interface UseImportTemplatesResult {
    templates: ImportTemplate[];
    categories: CategoryInfo[];
    getTemplateById: (id: string) => ImportTemplate | undefined;
    getTemplatesByCategory: (category: TemplateCategory) => ImportTemplate[];
    searchTemplates: (query: string) => ImportTemplate[];
    isLoading: boolean;
}

export function useImportTemplates(): UseImportTemplatesResult {
    const { data: templates = [], isLoading: templatesLoading } = useQuery({
        queryKey: importTemplateKeys.lists(),
        queryFn: () =>
            api.query(importTemplatesDocument)
                .then((res: Record<string, unknown>) => {
                    const items = res?.dataHubImportTemplates;
                    return Array.isArray(items) ? items as ImportTemplate[] : [];
                })
                .catch(() => [] as ImportTemplate[]),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });

    const { data: backendCategories, isLoading: categoriesLoading } = useQuery({
        queryKey: importTemplateKeys.categories(),
        queryFn: () =>
            api.query(importTemplateCategoriesDocument)
                .then((res: Record<string, unknown>) => {
                    const items = res?.dataHubImportTemplateCategories;
                    return Array.isArray(items) ? items as CategoryInfo[] : [];
                })
                .catch(() => [] as CategoryInfo[]),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });

    const categories = React.useMemo(
        () => backendCategories ?? [],
        [backendCategories],
    );

    const getTemplateById = React.useCallback(
        (id: string) => templates.find(t => t.id === id),
        [templates],
    );

    const getTemplatesByCategory = React.useCallback(
        (category: TemplateCategory) => templates.filter(t => t.category === category),
        [templates],
    );

    const searchTemplates = React.useCallback(
        (query: string) => filterTemplates(templates, query),
        [templates],
    );

    return {
        templates,
        categories,
        getTemplateById,
        getTemplatesByCategory,
        searchTemplates,
        isLoading: templatesLoading || categoriesLoading,
    };
}
