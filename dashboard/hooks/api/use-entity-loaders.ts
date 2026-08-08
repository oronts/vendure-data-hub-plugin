import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { CACHE_TIMES } from '../../constants';
import { useDynamicMetadataTranslations } from '../use-dynamic-metadata-translations';

const base = createQueryKeys('entity-loaders');
const entityLoaderKeys = {
    ...base,
    supported: () => [...base.all, 'supported'] as const,
};

const supportedEntitiesDocument = graphql(`
    query DataHubSupportedEntitiesApi {
        dataHubSupportedEntities {
            code
            name
            description
            supportedOperations
            adapterCode
        }
    }
`);

export function useEntityLoaders() {
    const { translateEntity } = useDynamicMetadataTranslations();
    const { data, ...rest } = useQuery({
        queryKey: entityLoaderKeys.supported(),
        queryFn: () => api.query(supportedEntitiesDocument).then(res => res.dataHubSupportedEntities),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
    const entities = useMemo(
        () => (data ?? []).map(entity => ({
            ...entity,
            name: translateEntity(entity.code, 'name', entity.name),
            description: entity.description
                ? translateEntity(entity.code, 'description', entity.description)
                : entity.description,
        })),
        [data, translateEntity],
    );

    const getLoaderAdapterCode = useCallback(
        (entityType: string): string | undefined => {
            return entities.find(e => e.code === entityType)?.adapterCode;
        },
        [entities],
    );

    return {
        ...rest,
        entities,
        getLoaderAdapterCode,
    };
}
