import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { CACHE_TIMES } from '../../constants';
import { screamingSnakeToKebab } from '../../../shared/utils/string-case';

const base = createQueryKeys('entity-field-schemas');
const entityFieldSchemaKeys = {
    ...base,
    schemas: () => [...base.all, 'all'] as const,
};

const entityFieldSchemasDocument = graphql(`
    query DataHubEntityFieldSchemasApi {
        dataHubLoaderEntitySchemas {
            entityType
            fields {
                key
                label
                type
                required
                readonly
                lookupable
            }
        }
    }
`);

interface EntityFieldInfo {
    key: string;
    label: string;
    type: string;
    required: boolean;
    readonly: boolean;
    lookupable: boolean;
}

interface EntityFieldSchemaMap {
    [entityCode: string]: EntityFieldInfo[];
}

/**
 * Hook to load entity field schemas from the backend via
 * `dataHubLoaderEntitySchemas`. Returns a map from kebab-case
 * entity code to an array of field definitions.
 *
 * Use `getFieldNames(entityCode)` to get field keys for a given entity.
 * Falls back to an empty array while loading or if the entity is unknown.
 */
export function useEntityFieldSchemas() {
    const { data, isLoading, ...rest } = useQuery({
        queryKey: entityFieldSchemaKeys.schemas(),
        queryFn: () => api.query(entityFieldSchemasDocument).then(res => res.dataHubLoaderEntitySchemas),
        staleTime: CACHE_TIMES.VENDURE_SCHEMAS,
    });

    const schemaMap = useMemo<EntityFieldSchemaMap>(() => {
        if (!data) return {};
        const map: EntityFieldSchemaMap = {};
        for (const schema of data) {
            const code = screamingSnakeToKebab(schema.entityType);
            map[code] = schema.fields.map(f => ({
                key: f.key,
                label: f.label,
                type: f.type,
                required: f.required ?? false,
                readonly: f.readonly ?? false,
                lookupable: f.lookupable ?? false,
            }));
        }
        return map;
    }, [data]);

    const getFieldNames = useCallback(
        (entityCode: string): string[] => {
            const fields = schemaMap[entityCode];
            if (!fields) return [];
            return fields.map(f => f.key);
        },
        [schemaMap],
    );

    const getFields = useCallback(
        (entityCode: string): EntityFieldInfo[] => {
            return schemaMap[entityCode] ?? [];
        },
        [schemaMap],
    );

    return {
        ...rest,
        isLoading,
        schemaMap,
        getFieldNames,
        getFields,
    };
}
