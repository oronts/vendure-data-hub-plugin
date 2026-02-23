import * as React from 'react';
import { memo } from 'react';
import type { TriggerType, TriggerSelectorProps } from '../../../types';
import { useTriggerIconResolver } from '../../../hooks';
import { SelectableCard, SelectableCardGrid } from '../selectable-card';

function TriggerSelectorComponent({
    options,
    value,
    onChange,
    columns = 4,
}: TriggerSelectorProps) {
    const resolveTriggerIcon = useTriggerIconResolver();
    return (
        <SelectableCardGrid columns={columns}>
            {options.map(option => {
                const Icon = resolveTriggerIcon(option.id as TriggerType);
                return (
                    <SelectableCard
                        key={option.id}
                        icon={Icon}
                        title={option.label}
                        description={option.desc}
                        selected={value === option.id}
                        onClick={() => onChange(option.id)}
                    />
                );
            })}
        </SelectableCardGrid>
    );
}

export const TriggerSelector = memo(TriggerSelectorComponent);
