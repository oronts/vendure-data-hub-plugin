import * as React from 'react';
import { memo } from 'react';
import { Card, CardContent, Badge } from '@vendure/dashboard';
import type { ColumnStatsProps } from './Types';

function ColumnStatsComponent({ columns, rowCount }: ColumnStatsProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {columns.map(col => (
                <Card key={col.name}>
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm truncate">{col.name}</span>
                            <Badge variant="outline" className="text-xs">{col.type}</Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                            <div className="flex justify-between">
                                <span>Unique</span>
                                <span>{col.uniqueCount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Null/Empty</span>
                                <span>{col.nullCount.toLocaleString()} ({((col.nullCount / rowCount) * 100).toFixed(1)}%)</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

export const ColumnStats = memo(ColumnStatsComponent);
