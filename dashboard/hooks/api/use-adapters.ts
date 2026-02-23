import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { CACHE_TIMES } from '../../constants';

const base = createQueryKeys('adapters');
const adapterKeys = {
    ...base,
    catalog: () => [...base.all, 'catalog'] as const,
    byType: (type: string) => [...base.all, 'byType', type] as const,
};

const adaptersDocument = graphql(`
    query DataHubAdaptersApi {
        dataHubAdapters {
            type
            code
            name
            description
            category
            categoryLabel
            categoryOrder
            schema {
                fields {
                    key
                    label
                    description
                    type
                    required
                    defaultValue
                    placeholder
                    options {
                        value
                        label
                    }
                    group
                    dependsOn {
                        field
                        value
                        operator
                    }
                    validation {
                        min
                        max
                        minLength
                        maxLength
                        pattern
                        patternMessage
                    }
                }
                groups {
                    id
                    label
                    description
                }
            }
            icon
            color
            pure
            async
            batchable
            requires
            entityType
            formatType
            patchableFields
            editorType
            summaryTemplate
            wizardHidden
            builtIn
        }
    }
`);

export function useAdapters() {
    return useQuery({
        queryKey: adapterKeys.catalog(),
        queryFn: () => api.query(adaptersDocument).then((res) => res.dataHubAdapters),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
}

export function useAdaptersByType(type: string) {
    const { data: adapters, ...rest } = useAdapters();
    const filtered = React.useMemo(
        () => adapters?.filter((a) => a.type === type),
        [adapters, type]
    );
    return { ...rest, data: filtered };
}

