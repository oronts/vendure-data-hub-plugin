import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { LOGGER_CONTEXTS } from '../../constants';
import { closeSecureFetchDispatchers } from '../../utils/secure-fetch.utils';
import { configureGlobalSsrfProtection } from '../../utils/url-security.utils';
import { toErrorOrUndefined } from '../../utils/error.utils';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

@Injectable()
export class SecureFetchLifecycleService implements OnApplicationShutdown {
    private readonly logger: DataHubLogger;

    constructor(loggerFactory: DataHubLoggerFactory) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.SECURE_FETCH);
    }

    async onApplicationShutdown(): Promise<void> {
        try {
            await closeSecureFetchDispatchers();
        } catch (error) {
            this.logger.error(
                'Failed to close secure HTTP dispatchers',
                toErrorOrUndefined(error),
            );
        } finally {
            configureGlobalSsrfProtection(undefined);
        }
    }
}
