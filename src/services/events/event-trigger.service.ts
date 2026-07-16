import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { EventBus, VendureEvent } from '@vendure/core';
import { VENDURE_EVENT_TYPES } from '../../../shared/types';
import { LOGGER_CONTEXTS } from '../../constants';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';
import { VENDURE_EVENT_CLASSES } from './event-trigger.contract';
import { EventTriggerOutboxService } from './event-trigger-outbox.service';

const BLOCKING_HANDLER_ID = 'data-hub.event-trigger-outbox';

@Injectable()
export class DataHubEventTriggerService implements OnModuleInit {
    private readonly logger: DataHubLogger;
    private registeredEventHandlers = 0;

    constructor(
        @Optional() private eventBus: EventBus,
        private outbox: EventTriggerOutboxService,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.EVENT_TRIGGER_SERVICE);
    }

    onModuleInit(): void {
        if (!this.eventBus) return;

        const eventClasses = VENDURE_EVENT_TYPES.map(event => VENDURE_EVENT_CLASSES[event]);
        this.eventBus.registerBlockingEventHandler<VendureEvent>({
            event: eventClasses,
            id: BLOCKING_HANDLER_ID,
            handler: event => this.capture(event),
        });
        this.registeredEventHandlers = eventClasses.length;
        this.logger.info('Transactional Vendure event trigger handlers registered', {
            eventCount: this.registeredEventHandlers,
        });
    }

    private async capture(event: VendureEvent): Promise<void> {
        const deliveryCount = await this.outbox.capture(event);
        if (deliveryCount > 0) {
            this.logger.debug('Vendure event committed to trigger outbox', {
                event: event.constructor.name,
                deliveryCount,
            });
        }
    }

    getHealthMetrics(): {
        registeredEventHandlers: number;
        transactionalOutboxEnabled: boolean;
    } {
        return {
            registeredEventHandlers: this.registeredEventHandlers,
            transactionalOutboxEnabled: this.registeredEventHandlers > 0,
        };
    }
}
