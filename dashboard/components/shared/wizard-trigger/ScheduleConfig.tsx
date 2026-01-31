import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Input,
    Label,
} from '@vendure/dashboard';
import { CRON_PRESETS, UI_STRINGS } from '../../../constants';
import type { ScheduleConfigProps } from '../../../types';

export function ScheduleConfig({ cron, onChange, showCard = true }: ScheduleConfigProps) {
    const content = (
        <div className="space-y-4">
            <div>
                <Label className="mb-2 block">Quick Presets</Label>
                <div className="flex flex-wrap gap-2">
                    {CRON_PRESETS.map(preset => (
                        <Button
                            key={preset.cron}
                            variant={cron === preset.cron ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => onChange(preset.cron)}
                        >
                            {preset.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div>
                <Label>Cron Expression</Label>
                <Input
                    value={cron}
                    onChange={e => onChange(e.target.value)}
                    placeholder="0 0 * * *"
                    className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                    {UI_STRINGS.CRON_FORMAT_HINT}
                </p>
            </div>
        </div>
    );

    if (!showCard) {
        return content;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Schedule Configuration</CardTitle>
            </CardHeader>
            <CardContent>{content}</CardContent>
        </Card>
    );
}
