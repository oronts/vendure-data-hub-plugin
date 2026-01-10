import { InputRecord } from '../../types/index';

export interface StockLocationInput extends InputRecord {
    /** Stock location name */
    name: string;

    /** Optional description */
    description?: string;

    /** Custom fields */
    customFields?: Record<string, unknown>;
}
