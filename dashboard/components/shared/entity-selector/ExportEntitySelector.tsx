import { useExportEntitySchemas } from '../../../hooks/api/use-export-entity-schemas';
import type { EntitySelectorProps } from '../../../types';
import { EntitySelectorView } from './EntitySelector';

export function ExportEntitySelector(props: EntitySelectorProps) {
    const query = useExportEntitySchemas();
    const entities = query.entities.map(entity => ({
        ...entity,
        fieldCount: query.getFields(entity.code).length,
    }));

    return (
        <EntitySelectorView
            {...props}
            entities={entities}
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            onRetry={() => void query.refetch()}
        />
    );
}
