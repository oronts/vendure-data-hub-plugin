import type {
    QueryConfig,
    ExportField,
    ExportFormatConfig,
    DestinationConfig,
    ExportTriggerConfig,
    CacheConfig,
    ExportOptions,
} from '../../../types/wizard';
import type { FilterCondition } from '../../../types';

export interface ExportWizardProps {
    onComplete: (config: ExportConfiguration) => void;
    onCancel: () => void;
    initialConfig?: Partial<ExportConfiguration>;
    isSubmitting?: boolean;
}

export interface ExportConfiguration {
    name: string;
    description?: string;
    sourceEntity: string;
    sourceQuery?: QueryConfig;
    filters?: FilterCondition[];
    fields: ExportField[];
    format: ExportFormatConfig;
    destination: DestinationConfig;
    trigger: ExportTriggerConfig;
    caching?: CacheConfig;
    options: ExportOptions;
}

export type QueryType = QueryConfig['type'];
/** Derived from DestinationConfig */
export type DestinationType = DestinationConfig['type'];
export type ExportTriggerType = ExportTriggerConfig['type'];
export type CompressionType = NonNullable<ExportOptions['compression']>;

export type { ExportField };
