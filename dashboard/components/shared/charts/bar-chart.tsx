import * as React from 'react';
import { memo, useMemo } from 'react';
import { CHART_DIMENSIONS } from '../../../constants';
import type { SimpleBarChartProps } from '../../../types';

function SimpleBarChartComponent({
    data,
    height = CHART_DIMENSIONS.BAR_HEIGHT_DEFAULT,
    showLabels = true,
    className,
}: SimpleBarChartProps) {
    const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
    const ariaLabel = useMemo(() => {
        const description = data.map(d => `${d.label}: ${d.value}`).join(', ');
        return `Bar chart showing ${description}`;
    }, [data]);

    return (
        <div className={`w-full ${className ?? ''}`} style={{ height }} role="img" aria-label={ariaLabel} data-testid="datahub-barchart-chart">
            <div className="flex items-end justify-between gap-2 h-full">
                {data.map((item) => {
                    const barHeight = (item.value / maxValue) * 100;
                    return (
                        <div key={item.label} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs text-muted-foreground">
                                {item.value > 0 ? item.value : ''}
                            </span>
                            <div
                                className={`w-full rounded-t transition-all ${item.color || 'bg-primary'}`}
                                style={{ height: `${Math.max(barHeight, 2)}%` }}
                            />
                            {showLabels && (
                                <span className="text-xs text-muted-foreground truncate w-full text-center">
                                    {item.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const SimpleBarChart = memo(SimpleBarChartComponent);
