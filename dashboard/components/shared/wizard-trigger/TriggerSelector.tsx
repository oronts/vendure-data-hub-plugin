import * as React from 'react';
import { memo } from 'react';
import type { TriggerType, TriggerSelectorProps } from '../../../types';
import { TRIGGER_ICONS } from '../../../constants/Triggers';
import { Play } from 'lucide-react';
import { SelectableCard, SelectableCardGrid } from '../selectable-card';

function TriggerSelectorComponent({
    options,
    value,
    onChange,
    columns = 4,
}: TriggerSelectorProps) {
    return (
        <SelectableCardGrid columns={columns}>
            {options.map(option => {
                const Icon = TRIGGER_ICONS[option.id as TriggerType] ?? Play;
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
