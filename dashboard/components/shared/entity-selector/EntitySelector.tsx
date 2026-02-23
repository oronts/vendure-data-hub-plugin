import * as React from 'react';
import { memo } from 'react';
import { Badge } from '@vendure/dashboard';
import { Check } from 'lucide-react';
import { VENDURE_ENTITY_LIST, VENDURE_ENTITY_SCHEMAS } from '../../../../shared';
import { useEntityLoaders } from '../../../hooks/api/use-entity-loaders';
import { useEntityFieldSchemas } from '../../../hooks/api/use-entity-field-schemas';
import type { EntitySelectorProps } from '../../../types';

function EntitySelectorComponent({ value, onChange, className = '' }: EntitySelectorProps) {
    const { entities, isLoading } = useEntityLoaders();
    const { getFields: getBackendFields } = useEntityFieldSchemas();

    // Use dynamic entities from backend, fall back to hardcoded while loading
    const displayEntities = entities.length > 0
        ? entities.map(e => ({ code: e.code, name: e.name, description: e.description ?? '' }))
        : VENDURE_ENTITY_LIST;

    return (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
            {displayEntities.map(entity => {
                const isSelected = value === entity.code;
                // Use backend field data as primary, fall back to static schemas during loading
                const backendFields = getBackendFields(entity.code);
                const fieldCount = backendFields.length > 0
                    ? backendFields.length
                    : Object.keys(VENDURE_ENTITY_SCHEMAS[entity.code]?.fields ?? {}).length;

                return (
                    <button
                        key={entity.code}
                        type="button"
                        aria-label={`Select ${entity.name}`}
                        className={`p-4 border rounded-lg text-left transition-all ${
                            isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'hover:border-primary/50'
                        }`}
                        onClick={() => onChange(entity.code)}
                        data-testid={`datahub-entityselector-entity-${entity.code}`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{entity.name}</span>
                            {isSelected && <Check className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                            {entity.description}
                        </p>
                        <Badge variant="secondary" className="text-xs">
                            {fieldCount} fields
                        </Badge>
                    </button>
                );
            })}
        </div>
    );
}

export const EntitySelector = memo(EntitySelectorComponent);
