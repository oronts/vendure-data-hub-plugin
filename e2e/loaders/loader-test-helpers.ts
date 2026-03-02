/**
 * Shared test utilities for loader handler e2e tests.
 *
 * Provides helpers to resolve NestJS services from the test server,
 * create RequestContexts, and build minimal PipelineStepDefinition objects.
 */
import { INestApplication } from '@nestjs/common';
import { RequestContext, RequestContextService } from '@vendure/core';
import { LanguageCode } from '@vendure/common/lib/generated-types';
import { InitialData } from '@vendure/core';
import { StepType } from '../../src/constants/enums';
import { PipelineStepDefinition, JsonObject } from '../../shared/types';
import { RecordObject } from '../../src/runtime/executor-types';

/**
 * Standard initial data for loader e2e tests.
 * Provides the minimum Vendure setup needed: zone, country, tax category/rate,
 * shipping method, and payment method so that product+variant creation works.
 */
export const LOADER_TEST_INITIAL_DATA: InitialData = {
    defaultLanguage: LanguageCode.en,
    defaultZone: 'Europe',
    countries: [
        { name: 'Germany', code: 'DE', zone: 'Europe' },
        { name: 'Austria', code: 'AT', zone: 'Europe' },
    ],
    taxRates: [
        { name: 'Standard Tax', percentage: 20 },
    ],
    shippingMethods: [
        { name: 'Standard Shipping', price: 500 },
    ],
    paymentMethods: [
        { name: 'Standard Payment', handler: { code: 'dummy-payment-handler', arguments: [] } },
    ],
    collections: [],
};

/**
 * Get a NestJS provider from the test server's app
 */
export function getService<T>(app: INestApplication, serviceClass: { new (...args: unknown[]): T }): T {
    return app.get(serviceClass);
}

/**
 * Create a superadmin RequestContext for the default channel
 */
export async function getSuperadminContext(app: INestApplication): Promise<RequestContext> {
    const ctxService = app.get(RequestContextService);
    return ctxService.create({ apiType: 'admin' });
}

/**
 * Build a minimal PipelineStepDefinition suitable for handler.execute() calls
 */
export function makeStep(key: string, config: Record<string, unknown>): PipelineStepDefinition {
    return {
        key,
        type: StepType.LOAD,
        config: config as JsonObject,
    } as PipelineStepDefinition;
}

/**
 * Collect errors from onRecordError callbacks
 */
export interface RecordedError {
    stepKey: string;
    message: string;
    record: RecordObject;
    stack?: string;
}

export function createErrorCollector(): {
    errors: RecordedError[];
    callback: (stepKey: string, message: string, record: RecordObject, stack?: string) => Promise<void>;
} {
    const errors: RecordedError[] = [];
    return {
        errors,
        callback: async (stepKey: string, message: string, record: RecordObject, stack?: string) => {
            errors.push({ stepKey, message, record, stack });
        },
    };
}
