import * as React from 'react';
import { memo, useCallback } from 'react';
import { Badge } from '@vendure/dashboard';
import { Check } from 'lucide-react';
import { VENDURE_ENTITY_LIST, VENDURE_ENTITY_SCHEMAS } from '../../../../vendure-schemas/vendure-entity-schemas';
import type { EntitySelectorProps } from '../../../types';

function EntitySelectorComponent({ value, onChange, className = '' }: EntitySelectorProps) {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
            {VENDURE_ENTITY_LIST.map(entity => {
                const isSelected = value === entity.code;
                const schema = VENDURE_ENTITY_SCHEMAS[entity.code];
                const fieldCount = schema ? Object.keys(schema.fields).length : 0;

                return (
                    <button
                        key={entity.code}
                        type="button"
                        className={`p-4 border rounded-lg text-left transition-all ${
                            isSelected
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                                : 'hover:border-primary/50'
                        }`}
                        onClick={() => onChange(entity.code)}
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
