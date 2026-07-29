import * as React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    ScrollArea,
} from '@vendure/dashboard';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import {
    PANEL_WIDTHS,
} from '../../constants';
import type { AdapterMetadata } from '../../hooks';
import type { VisualNodeCategory } from '../../types';
import { VISUAL_NODE_CONFIGS } from './shared/visual-node-config';

const DEFAULT_EXPANDED_SECTIONS: Partial<Record<VisualNodeCategory, boolean>> = {
    trigger: true,
    source: true,
    transform: true,
    validate: false,
    enrich: true,
    condition: true,
    load: true,
    export: false,
    feed: false,
    sink: false,
    filter: true,
    gate: false,
};

export interface DynamicNodePaletteProps {
    readonly adapters: AdapterMetadata[];
    readonly onDragStart: (
        event: React.DragEvent,
        nodeType: string,
        category: string,
        label: string,
    ) => void;
    readonly onAddNode: (
        nodeType: string,
        category: string,
        label: string,
    ) => void;
}

interface PaletteAdapterItemProps {
    readonly adapter: AdapterMetadata;
    readonly category: string;
    readonly onDragStart: DynamicNodePaletteProps['onDragStart'];
    readonly onAddNode: DynamicNodePaletteProps['onAddNode'];
}

const PaletteAdapterItem = React.memo(function PaletteAdapterItem({
    adapter,
    category,
    onDragStart,
    onAddNode,
}: PaletteAdapterItemProps) {
    const { t } = useLingui();
    const Icon = adapter.icon;

    const handleDragStart = React.useCallback((event: React.DragEvent) => {
        onDragStart(event, adapter.code, category, adapter.name);
    }, [adapter.code, adapter.name, category, onDragStart]);

    const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onAddNode(adapter.code, category, adapter.name);
        }
    }, [adapter.code, adapter.name, category, onAddNode]);

    return (
        <div
            className="border rounded p-2 cursor-move hover:bg-muted active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            draggable
            onDragStart={handleDragStart}
            onKeyDown={handleKeyDown}
            title={adapter.description || ''}
            role="button"
            tabIndex={0}
            aria-label={t`Add ${adapter.name} node to pipeline`}
        >
            <div className="flex items-center gap-2">
                <div
                    className="w-6 h-6 rounded flex items-center justify-center text-white"
                    style={{ backgroundColor: adapter.color }}
                >
                    <Icon className="w-3 h-3" />
                </div>
                <div className="truncate text-xs flex-1 min-w-0">
                    <div className="font-medium truncate">{adapter.name}</div>
                    {adapter.description && (
                        <div className="text-[10px] text-muted-foreground truncate">
                            {adapter.description}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

interface PaletteSectionHeaderProps {
    readonly sectionKey: VisualNodeCategory;
    readonly label: string;
    readonly Icon: React.ComponentType<{ className?: string }>;
    readonly isExpanded: boolean;
    readonly onToggle: (key: VisualNodeCategory) => void;
}

const PaletteSectionHeader = React.memo(function PaletteSectionHeader({
    sectionKey,
    label,
    Icon,
    isExpanded,
    onToggle,
}: PaletteSectionHeaderProps) {
    const handleClick = React.useCallback(() => {
        onToggle(sectionKey);
    }, [onToggle, sectionKey]);

    return (
        <button
            type="button"
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium hover:bg-muted rounded"
            onClick={handleClick}
            aria-expanded={isExpanded}
        >
            <span className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-muted-foreground" />
                {label}
            </span>
            {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
            ) : (
                <ChevronRight className="w-4 h-4" />
            )}
        </button>
    );
});

export function DynamicNodePalette({
    adapters,
    onDragStart,
    onAddNode,
}: DynamicNodePaletteProps) {
    const { t } = useLingui();
    const [expanded, setExpanded] = React.useState(DEFAULT_EXPANDED_SECTIONS);

    const handleToggleSection = React.useCallback((sectionKey: VisualNodeCategory) => {
        setExpanded(current => ({
            ...current,
            [sectionKey]: !current[sectionKey],
        }));
    }, []);

    const sections = (
        (Object.keys(VISUAL_NODE_CONFIGS) as VisualNodeCategory[])
            .map(category => {
                const config = VISUAL_NODE_CONFIGS[category];
                if (!config) return null;
                const items = adapters.filter(adapter => adapter.nodeType === category);
                return {
                    key: category,
                    label: (() => {
                        switch (category) {
                            case 'trigger': return t`Triggers`;
                            case 'source': return t`Data Sources`;
                            case 'transform': return t`Transforms`;
                            case 'validate': return t`Validation`;
                            case 'enrich': return t`Enrichment`;
                            case 'condition': return t`Conditions`;
                            case 'load': return t`Loaders`;
                            case 'export': return t`Exports`;
                            case 'feed': return t`Feeds`;
                            case 'sink': return t`Sinks`;
                            case 'filter': return t`Filters`;
                            case 'gate': return t`Gates`;
                        }
                    })(),
                    items,
                    category,
                    icon: config.icon,
                };
            })
            .filter((section): section is NonNullable<typeof section> => (
                section !== null && section.items.length > 0
            ))
    );

    return (
        <Card className={`${PANEL_WIDTHS.NODE_PALETTE} flex max-h-64 flex-col overflow-hidden lg:h-full lg:max-h-none`}>
            <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <Trans>Node Palette</Trans>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full max-h-48 lg:max-h-none">
                    <div className="space-y-1 p-2">
                        {sections.map(section => (
                            <div key={section.key}>
                                <PaletteSectionHeader
                                    sectionKey={section.key}
                                    label={section.label}
                                    Icon={section.icon}
                                    isExpanded={Boolean(expanded[section.key])}
                                    onToggle={handleToggleSection}
                                />
                                {Boolean(expanded[section.key]) && (
                                    <div className="grid grid-cols-2 gap-2 px-2 py-2">
                                        {section.items.map(adapter => (
                                            <PaletteAdapterItem
                                                key={adapter.code}
                                                adapter={adapter}
                                                category={section.category}
                                                onDragStart={onDragStart}
                                                onAddNode={onAddNode}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
