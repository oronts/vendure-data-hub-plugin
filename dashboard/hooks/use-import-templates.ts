import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@vendure/dashboard";
import { graphql } from "../gql";
import type { TemplateCategory } from "../types";
import { CACHE_TIMES } from "../constants";
import { filterTemplates } from "../utils/template-helpers";
import { createQueryKeys } from "../utils/query-key-factory";
import type {
  FileSourceConfig,
  ImportSourceConfig,
  ImportStrategies,
} from "../types/wizard";
import { useDynamicMetadataTranslations } from "./use-dynamic-metadata-translations";

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
    sourceType?: ImportSourceConfig["type"];
    fileFormat?: FileSourceConfig["format"];
    targetEntity?: string;
    existingRecords?: ImportStrategies["existingRecords"];
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

const importTemplatesDocument = graphql(`
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

const importTemplateCategoriesDocument = graphql(`
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

const base = createQueryKeys("import-templates");
const importTemplateKeys = {
  ...base,
  categories: () => [...base.all, "categories"] as const,
};

export interface UseImportTemplatesResult {
  templates: ImportTemplate[];
  categories: CategoryInfo[];
  getTemplateById: (id: string) => ImportTemplate | undefined;
  getTemplatesByCategory: (category: TemplateCategory) => ImportTemplate[];
  searchTemplates: (query: string) => ImportTemplate[];
  isLoading: boolean;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export function useImportTemplates(): UseImportTemplatesResult {
  const { translateImportCategory, translateImportTemplate } =
    useDynamicMetadataTranslations();
  const templatesQuery = useQuery({
    queryKey: importTemplateKeys.lists(),
    queryFn: () =>
      api.query(importTemplatesDocument).then((res) =>
        res.dataHubImportTemplates.map((template) => ({
          ...template,
          category: template.category as TemplateCategory,
          icon: template.icon ?? undefined,
          optionalFields: template.optionalFields ?? [],
          sampleData: Array.isArray(template.sampleData)
            ? (template.sampleData as Record<string, unknown>[])
            : undefined,
          featured: template.featured ?? undefined,
          tags: template.tags ?? undefined,
          formats: template.formats ?? undefined,
          definition: template.definition as ImportTemplate["definition"],
        })),
      ),
    staleTime: CACHE_TIMES.ADAPTER_CATALOG,
  });

  const categoriesQuery = useQuery({
    queryKey: importTemplateKeys.categories(),
    queryFn: () =>
      api.query(importTemplateCategoriesDocument).then((res) =>
        res.dataHubImportTemplateCategories.map((category) => ({
          ...category,
          category: category.category as TemplateCategory,
        })),
      ),
    staleTime: CACHE_TIMES.ADAPTER_CATALOG,
  });

  const templates = React.useMemo(
    () =>
      (templatesQuery.data ?? []).map((template) => ({
        ...template,
        name: translateImportTemplate(template.id, "name", template.name),
        description: translateImportTemplate(
          template.id,
          "description",
          template.description,
        ),
      })),
    [templatesQuery.data, translateImportTemplate],
  );
  const categories = React.useMemo(
    () =>
      (categoriesQuery.data ?? []).map((category) => ({
        ...category,
        label: translateImportCategory(
          category.category,
          "name",
          category.label,
        ),
        description: translateImportCategory(
          category.category,
          "description",
          category.description,
        ),
      })),
    [categoriesQuery.data, translateImportCategory],
  );

  const getTemplateById = React.useCallback(
    (id: string) => templates.find((t) => t.id === id),
    [templates],
  );

  const getTemplatesByCategory = React.useCallback(
    (category: TemplateCategory) =>
      templates.filter((t) => t.category === category),
    [templates],
  );

  const searchTemplates = React.useCallback(
    (query: string) => filterTemplates(templates, query),
    [templates],
  );

  const refetchTemplates = templatesQuery.refetch;
  const refetchCategories = categoriesQuery.refetch;
  const refetch = React.useCallback(
    () => Promise.all([refetchTemplates(), refetchCategories()]),
    [refetchCategories, refetchTemplates],
  );

  return {
    templates,
    categories,
    getTemplateById,
    getTemplatesByCategory,
    searchTemplates,
    isLoading: templatesQuery.isLoading || categoriesQuery.isLoading,
    isPending: templatesQuery.isPending || categoriesQuery.isPending,
    isError: templatesQuery.isError || categoriesQuery.isError,
    error: templatesQuery.error ?? categoriesQuery.error,
    refetch,
  };
}
