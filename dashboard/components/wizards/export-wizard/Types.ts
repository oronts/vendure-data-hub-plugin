import type {
    QueryConfig,
    ExportField,
    ExportFormatConfig,
    DestinationConfig,
    ExportTriggerConfig,
    CacheConfig,
    ExportOptions,
} from '../../../types/Wizard';
import type { FilterCondition } from '../../../types';
import type { HttpMethod } from '../../../../shared/types';
import type {
    HttpAuthType as WizardHttpAuthType,
} from '../../../constants/WizardOptions';

export interface ExportWizardProps {
    onComplete: (config: ExportConfiguration) => void;
    onCancel: () => void;
    initialConfig?: Partial<ExportConfiguration>;
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
export type DestinationType = DestinationConfig['type'];
export type { HttpMethod };
export type HttpAuthType = WizardHttpAuthType;
export type FormatType = ExportFormatConfig['type'];
export type ExportTriggerType = ExportTriggerConfig['type'];
export type CompressionType = NonNullable<ExportOptions['compression']>;

export type { FilterOperator } from '../../../types';
export type { ExportField };
