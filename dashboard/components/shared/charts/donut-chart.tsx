import * as React from 'react';
import { memo, useMemo } from 'react';
import { CHART_DIMENSIONS, ICON_SIZES } from '../../../constants';
import type { SimpleDonutChartProps } from '../../../types';

function SimpleDonutChartComponent({
    data,
    size = CHART_DIMENSIONS.DONUT_SIZE_DEFAULT,
    thickness = CHART_DIMENSIONS.DONUT_THICKNESS,
    showLegend = true,
    className,
}: SimpleDonutChartProps) {
    const { total, radius, circumference, segments } = useMemo(() => {
        const t = data.reduce((sum, d) => sum + d.value, 0) || 1;
        const r = (size - thickness) / 2;
        const c = 2 * Math.PI * r;

        let offset = 0;
        const segs = data.map((item) => {
            const percentage = item.value / t;
            const strokeDasharray = `${c * percentage} ${c}`;
            const segmentOffset = offset;
            offset += c * percentage;
            return { ...item, strokeDasharray, offset: segmentOffset };
        });

        return { total: t, radius: r, circumference: c, segments: segs };
    }, [data, size, thickness]);

    return (
        <div className={`flex items-center gap-6 ${className ?? ''}`}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted"
                    strokeWidth={thickness}
                />
                {segments.map((item) => (
                    <circle
                        key={item.label}
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={item.color}
                        strokeWidth={thickness}
                        strokeDasharray={item.strokeDasharray}
                        strokeDashoffset={-item.offset}
                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                        className="transition-all"
                    />
                ))}
                <text
                    x={size / 2}
                    y={size / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-foreground text-2xl font-bold"
                >
                    {total}
                </text>
            </svg>
            {showLegend && (
                <div className="space-y-2">
                    {data.map((item) => (
                        <div key={item.label} className="flex items-center gap-2">
                            <div
                                className={`${ICON_SIZES.XS} rounded-full`}
                                style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm">{item.label}</span>
                            <span className="text-sm font-medium ml-auto">{item.value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export const SimpleDonutChart = memo(SimpleDonutChartComponent);
