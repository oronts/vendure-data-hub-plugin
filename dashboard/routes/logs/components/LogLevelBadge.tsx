import * as React from 'react';
import { memo } from 'react';
import { AlertCircle, AlertTriangle, Bug, Info } from 'lucide-react';
import { getLogLevelColor } from '../../../constants';

/**
 * Compact level badge showing abbreviated level with count
 */
export const LevelBadge = memo(function LevelBadge({ level, count }: Readonly<{ level: string; count: number }>) {
    return (
        <span className={`text-xs px-1.5 py-0.5 rounded ${getLogLevelColor(level)}`}>
            {level.charAt(0)}: {count}
        </span>
    );
});

/**
 * Log level badge with icon and full level text
 */
export const LogLevelBadge = memo(function LogLevelBadge({ level }: Readonly<{ level: string }>) {
    const icons: Record<string, React.ReactNode> = {
        DEBUG: <Bug className="w-3 h-3" />,
        INFO: <Info className="w-3 h-3" />,
        WARN: <AlertTriangle className="w-3 h-3" />,
        ERROR: <AlertCircle className="w-3 h-3" />,
    };
    const icon = icons[level] ?? icons.INFO;
    return (
        <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${getLogLevelColor(level)}`}>
            {icon}
            {level}
        </span>
    );
});
