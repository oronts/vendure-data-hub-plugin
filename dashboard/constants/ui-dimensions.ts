/**
 * Debounce delays in milliseconds for various input validations.
 * Standard delay of 300ms balances responsiveness with avoiding excessive re-validation.
 */
export const DEBOUNCE_DELAYS = {
    /** JSON validation debounce: 300ms */
    JSON_VALIDATION: 300,
    /** Form field validation debounce: 300ms */
    FORM_VALIDATION: 300,
    /** Default debounce delay: 300ms */
    DEFAULT: 300,
} as const;

export const COMPONENT_HEIGHTS = {
    DIALOG_MAX_LG: 'max-h-[85vh]',
    DIALOG_MAX_MD: 'max-h-[80vh]',
    DIALOG_MAX_SM: 'max-h-[60vh]',
    SCROLL_AREA_LG: 'max-h-[600px]',
    SCROLL_AREA_MD: 'max-h-[400px]',
    SCROLL_AREA_SM: 'max-h-[300px]',
    SCROLL_AREA_XS: 'max-h-[200px]',
    SCROLL_AREA_XXS: 'max-h-[120px]',
    CHART_MD: 'h-[500px]',
    EDITOR_PANE_MD: 'h-[400px]',
    LIST_PANE_SM: 'h-[200px]',
    LIST_PANE_MD: 'h-[300px]',
    WIZARD_PANE_MD: 'h-[500px]',
    CODE_EDITOR_MIN: 'min-h-[260px]',
    CODE_DISPLAY_MIN: 'min-h-[200px]',
    CODE_BLOCK_MIN: 'min-h-[160px]',
    CODE_BLOCK_XS: 'min-h-[100px]',
    CODE_BLOCK_SM: 'min-h-[120px]',
    CODE_BLOCK_MD: 'min-h-[140px]',
    FORMULA_HELP_SCROLL: 'h-[200px]',
} as const;

export const COMPONENT_WIDTHS = {
    DRAWER_LG: 'w-[540px]',
    DRAWER_MD: 'w-[400px]',
    SELECT_SM: 'w-[250px]',
    SELECT_XS: 'w-[160px]',
    TABLE_CELL_MAX_LG: 'max-w-[640px]',
    TABLE_CELL_MAX_SM: 'max-w-[300px]',
    TABLE_HEADER_MIN: 'min-w-[120px]',
    NODE_MIN: 'min-w-[150px]',
    TYPECAST_SELECT: 'w-32',
    LOGIC_SELECT: 'w-20',
    OPERATOR_SELECT: 'w-32',
    AGGREGATION_SELECT: 'w-28',
    ALIAS_INPUT: 'w-32',
} as const;

/**
 * Chart dimension constants for consistent chart sizing.
 * Heights are in pixels, scroll areas use Tailwind classes.
 */
export const CHART_DIMENSIONS = {
    /** Default bar chart height: 200px */
    BAR_HEIGHT_DEFAULT: 200,
    /** Small bar chart height: 150px */
    BAR_HEIGHT_SM: 150,
    /** Medium bar chart height: 180px */
    BAR_HEIGHT_MD: 180,
    /** Default donut chart size: 160px */
    DONUT_SIZE_DEFAULT: 160,
    /** Donut chart stroke thickness: 24px */
    DONUT_THICKNESS: 24,
    /** Small scroll area height */
    SCROLL_AREA_SM: 'h-[300px]',
    /** Large scroll area height */
    SCROLL_AREA_LG: 'h-[500px]',
} as const;

export const ICON_SIZES = {
    XS: 'w-3 h-3',
    SM: 'w-4 h-4',
    MD: 'w-5 h-5',
    LG: 'w-6 h-6',
    XL: 'w-8 h-8',
    XXL: 'w-10 h-10',
    HERO: 'w-12 h-12',
} as const;

export const NODE_DIMENSIONS = {
    MIN_WIDTH: 'min-w-[180px]',
    HANDLE_SIZE: '!w-3 !h-3',
    ICON_SM: 'w-4 h-4',
} as const;

/**
 * File dropzone dimensions
 */
export const DROPZONE_DIMENSIONS = {
    ICON_DEFAULT: 'w-12 h-12',
    ICON_COMPACT: 'w-8 h-8',
    PADDING_DEFAULT: 'p-12',
    PADDING_COMPACT: 'p-6',
    FILE_ICON_DEFAULT: 'w-10 h-10',
    FILE_ICON_COMPACT: 'w-8 h-8',
} as const;

/**
 * Wizard progress bar styles
 */
export const PROGRESS_BAR_STYLES = {
    ACTIVE: 'bg-primary text-primary-foreground',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PENDING: 'text-muted-foreground hover:bg-muted',
} as const;

export const SKELETON_WIDTHS = [80, 120, 100, 140] as const;

/**
 * Get a skeleton width based on index (cycles through available widths).
 */
export function getSkeletonWidth(index: number): number {
    return SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
}

/**
 * Panel widths for drawers and side panels
 */
export const PANEL_WIDTHS = {
    PROPERTIES_DEFAULT: '420px',
    NODE_PALETTE: 'w-[260px]',
    MAX_VW: '90vw',
} as const;

/**
 * Dialog content dimensions
 */
export const DIALOG_DIMENSIONS = {
    MAX_WIDTH_2XL: 'max-w-2xl',
    MAX_WIDTH_4XL: 'max-w-4xl',
    MAX_HEIGHT_80VH: 'max-h-[80vh]',
    MAX_HEIGHT_85VH: 'max-h-[85vh]',
} as const;

/**
 * Select component widths
 */
export const SELECT_WIDTHS = {
    TRIGGER_TYPE: 'w-[180px]',
    PROVIDER: 'w-[220px]',
    CONNECTION_TYPE: 'w-[250px]',
    RUN_STATUS: 'w-[160px]',
    ADAPTER_SELECTOR: 'w-[400px]',
} as const;

/**
 * Scroll area heights
 */
export const SCROLL_HEIGHTS = {
    PROPERTIES_PANEL: 'h-[calc(100vh-80px)]',
    NODE_PALETTE: 'h-[calc(100vh-200px)]',
    REALTIME_LOGS: 'max-h-[600px]',
    DRY_RUN_RESULTS: 'max-h-[300px]',
    VALIDATION_PANEL: 'max-h-[60vh]',
} as const;

/**
 * Text area heights
 */
export const TEXTAREA_HEIGHTS = {
    CODE_EXPORT_MIN: 'min-h-[200px]',
    CODE_EXPORT_MAX: 'max-h-[400px]',
    ADAPTER_SCHEMA: 'min-h-[160px]',
} as const;
