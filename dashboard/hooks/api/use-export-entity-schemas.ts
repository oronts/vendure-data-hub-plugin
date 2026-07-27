import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { CACHE_TIMES } from '../../constants';
import { createQueryKeys } from '../../utils/query-key-factory';
import { screamingSnakeToKebab } from '../../../shared/utils/string-case';
import { useDynamicMetadataTranslations } from '../use-dynamic-metadata-translations';

const base = createQueryKeys('export-entity-schemas');
const exportEntitySchemaKeys = {
    ...base,
    schemas: () => [...base.all, 'all'] as const,
};

const exportEntitySchemasDocument = graphql(`
    query DataHubExportEntitySchemasApi {
        dataHubExportEntitySchemas {
            entityType
            name
            description
            fields {
                key
                label
                type
                description
                queryable
            }
        }
    }
`);

export interface ExportEntityFieldInfo {
    key: string;
    label: string;
    type: string;
    description?: string | null;
    queryable: boolean;
}

export interface ExportEntityInfo {
    code: string;
    name: string;
    description: string;
}

interface ExportEntitySchemaInfo extends ExportEntityInfo {
    fields: ExportEntityFieldInfo[];
}

export function useExportEntitySchemas() {
    const { translateEntity } = useDynamicMetadataTranslations();
    const query = useQuery({
        queryKey: exportEntitySchemaKeys.schemas(),
        queryFn: () => api.query(exportEntitySchemasDocument)
            .then(result => result.dataHubExportEntitySchemas),
        staleTime: CACHE_TIMES.VENDURE_SCHEMAS,
    });

    const schemaMap = useMemo(() => {
        const map = new Map<string, ExportEntitySchemaInfo>();
        for (const schema of query.data ?? []) {
            const code = screamingSnakeToKebab(schema.entityType);
            map.set(schema.entityType, {
                code,
                name: translateEntity(code, 'name', schema.name),
                description: translateEntity(
                    code,
                    'description',
                    schema.description,
                ),
                fields: schema.fields.map(field => ({ ...field })),
            });
        }
        return map;
    }, [query.data, translateEntity]);

    const entities = useMemo<ExportEntityInfo[]>(
        () => Array.from(schemaMap.values(), ({ code, name, description }) => ({
            code,
            name,
            description,
        })),
        [schemaMap],
    );

    const getFields = useCallback(
        (entityType: string): ExportEntityFieldInfo[] => schemaMap.get(entityType)?.fields ?? [],
        [schemaMap],
    );

    const getFieldNames = useCallback(
        (entityType: string): string[] => getFields(entityType).map(field => field.key),
        [getFields],
    );

    const getQueryFieldNames = useCallback(
        (entityType: string): string[] => getFields(entityType)
            .filter(field => field.queryable)
            .map(field => field.key),
        [getFields],
    );

    const getEntityName = useCallback(
        (entityType: string): string | undefined => schemaMap.get(entityType)?.name,
        [schemaMap],
    );

    return {
        ...query,
        entities,
        schemaMap,
        getFields,
        getFieldNames,
        getQueryFieldNames,
        getEntityName,
    };
}
