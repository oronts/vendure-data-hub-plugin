/**
 * Template Gallery Component
 *
 * Displays available import templates with filtering and search capabilities.
 */

import * as React from 'react';
import { memo } from 'react';
import {
    ShoppingBag,
    Users,
    Package,
    FolderTree,
    Percent,
    Receipt,
    Layers,
    ShoppingCart,
    Store,
    DollarSign,
    MapPin,
    Warehouse,
    Folder,
    Tag,
    Search,
    Star,
    Clock,
    CheckCircle,
} from 'lucide-react';
import { Badge, Input } from '@vendure/dashboard';

/**
 * Template category type
 */
type TemplateCategory = 'products' | 'customers' | 'inventory' | 'orders' | 'promotions' | 'catalog';

/**
 * Template difficulty type
 */
type TemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Import template interface (matches backend type)
 */
interface ImportTemplate {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    icon?: string;
    difficulty: TemplateDifficulty;
    estimatedTime: string;
    requiredFields: string[];
    optionalFields: string[];
    featured?: boolean;
    tags?: string[];
}

/**
 * Category info for display
 */
interface CategoryInfo {
    category: TemplateCategory;
    label: string;
    description: string;
    icon: string;
    count: number;
}

export interface TemplateGalleryProps {
    templates: ImportTemplate[];
    categories: CategoryInfo[];
    selectedTemplate?: ImportTemplate | null;
    onSelectTemplate: (template: ImportTemplate) => void;
    onUseTemplate?: (template: ImportTemplate) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    'shopping-bag': ShoppingBag,
    'users': Users,
    'package': Package,
    'folder-tree': FolderTree,
    'percent': Percent,
    'receipt': Receipt,
    'layers': Layers,
    'shopping-cart': ShoppingCart,
    'store': Store,
    'dollar-sign': DollarSign,
    'map-pin': MapPin,
    'warehouse': Warehouse,
    'folder': Folder,
    'tag': Tag,
};

const DIFFICULTY_STYLES: Record<TemplateDifficulty, { bg: string; text: string }> = {
    beginner: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
    intermediate: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
    advanced: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
};

function TemplateCardComponent({
    template,
    selected,
    onSelect,
}: {
    template: ImportTemplate;
    selected: boolean;
    onSelect: () => void;
}) {
    const IconComponent = CATEGORY_ICONS[template.icon ?? 'package'] ?? Package;
    const difficultyStyle = DIFFICULTY_STYLES[template.difficulty];

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`
                relative p-4 rounded-lg border text-left transition-all w-full
                ${selected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }
            `}
        >
            {template.featured && (
                <div className="absolute top-2 right-2">
                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-md ${selected ? 'bg-primary/10' : 'bg-muted'}`}>
                    <IconComponent className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-sm truncate">{template.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                    </p>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${difficultyStyle.bg} ${difficultyStyle.text}`}>
                            {template.difficulty}
                        </span>
                        <span className="inline-flex items-center text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mr-1" />
                            {template.estimatedTime}
                        </span>
                    </div>
                </div>
            </div>

            {selected && (
                <div className="absolute bottom-2 right-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                </div>
            )}
        </button>
    );
}

const TemplateCard = memo(TemplateCardComponent);

function CategoryTabComponent({
    category,
    selected,
    onSelect,
}: {
    category: CategoryInfo;
    selected: boolean;
    onSelect: () => void;
}) {
    const IconComponent = CATEGORY_ICONS[category.icon] ?? Package;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`
                flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap
                ${selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }
            `}
        >
            <IconComponent className="h-4 w-4" />
            <span>{category.label}</span>
            <Badge variant="secondary" className="ml-1 text-xs">
                {category.count}
            </Badge>
        </button>
    );
}

const CategoryTab = memo(CategoryTabComponent);

function TemplateGalleryComponent({
    templates,
    categories,
    selectedTemplate,
    onSelectTemplate,
}: TemplateGalleryProps) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [selectedCategory, setSelectedCategory] = React.useState<TemplateCategory | 'all'>('all');

    const filteredTemplates = React.useMemo(() => {
        let filtered = templates;

        // Filter by category
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(t => t.category === selectedCategory);
        }

        // Filter by search query
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(query) ||
                t.description.toLowerCase().includes(query) ||
                t.requiredFields.some(f => f.toLowerCase().includes(query)) ||
                t.tags?.some(tag => tag.toLowerCase().includes(query)),
            );
        }

        return filtered;
    }, [templates, selectedCategory, searchQuery]);

    const featuredTemplates = React.useMemo(
        () => filteredTemplates.filter(t => t.featured),
        [filteredTemplates],
    );

    const regularTemplates = React.useMemo(
        () => filteredTemplates.filter(t => !t.featured),
        [filteredTemplates],
    );

    return (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="mb-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search templates..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className={`
                        flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap
                        ${selectedCategory === 'all'
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }
                    `}
                >
                    All Templates
                    <Badge variant="secondary" className="ml-1 text-xs">
                        {templates.length}
                    </Badge>
                </button>
                {categories.map(cat => (
                    <CategoryTab
                        key={cat.category}
                        category={cat}
                        selected={selectedCategory === cat.category}
                        onSelect={() => setSelectedCategory(cat.category)}
                    />
                ))}
            </div>

            {/* Template Grid */}
            <div className="flex-1 overflow-y-auto">
                {filteredTemplates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
                        <h3 className="text-lg font-medium">No templates found</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                            Try adjusting your search or category filter
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Featured Templates */}
                        {featuredTemplates.length > 0 && selectedCategory === 'all' && !searchQuery && (
                            <div>
                                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                                    <Star className="h-4 w-4 text-yellow-500" />
                                    Recommended Templates
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {featuredTemplates.map(template => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            selected={selectedTemplate?.id === template.id}
                                            onSelect={() => onSelectTemplate(template)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* All Templates */}
                        <div>
                            {featuredTemplates.length > 0 && selectedCategory === 'all' && !searchQuery && (
                                <h3 className="text-sm font-medium mb-3">All Templates</h3>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {(selectedCategory === 'all' && !searchQuery ? regularTemplates : filteredTemplates).map(template => (
                                    <TemplateCard
                                        key={template.id}
                                        template={template}
                                        selected={selectedTemplate?.id === template.id}
                                        onSelect={() => onSelectTemplate(template)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export const TemplateGallery = memo(TemplateGalleryComponent);
