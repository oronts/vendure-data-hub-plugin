/**
 * Target Configuration Types
 */

import { VendureEntityType, TargetOperation, DestinationType, FeedType, FileFormat } from './definition';

export interface TargetConfig {
    /** For IMPORT: Entity type to create/update */
    entity?: VendureEntityType;

    /** For IMPORT: Operation mode */
    operation?: TargetOperation;

    /** For IMPORT: Field(s) to identify existing records */
    lookupFields?: string[];

    /** For IMPORT: Channel assignment */
    channelCodes?: string[];

    /** For EXPORT: Destination type */
    destination?: DestinationType;

    /** For EXPORT: Destination connection code */
    connectionCode?: string;

    /** For EXPORT: Output format */
    format?: ExportFormatConfig;

    /** For EXPORT: Feed type (if applicable) */
    feedType?: FeedType;
}

export interface ExportFormatConfig {
    format: FileFormat;
    baseUrl?: string;
    currency?: string;
    utmParams?: Record<string, string>;

    csv?: {
        delimiter?: string;
        includeHeader?: boolean;
        quoteAll?: boolean;
    };

    xml?: {
        rootElement?: string;
        recordElement?: string;
        declaration?: boolean;
        prettyPrint?: boolean;
    };

    json?: {
        prettyPrint?: boolean;
        wrapInArray?: boolean;
    };
}
