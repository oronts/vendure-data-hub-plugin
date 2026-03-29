import { ID, RequestContext, PromotionService } from '@vendure/core';
import { ConfigurableOperationInput } from '@vendure/common/lib/generated-types';
import { PromotionConditionInput, PromotionActionInput } from './types';
import { ConditionsMode, ActionsMode } from '../../../shared/types';
import { DataHubLogger } from '../../services/logger';

export {
    isRecoverableError,
    shouldUpdateField,
    buildConfigurableOperation,
    buildConfigurableOperations,
} from '../shared-helpers';
import { buildConfigurableOperations } from '../shared-helpers';

/** Handle promotion conditions based on the specified mode. */
export async function handlePromotionConditions(
    ctx: RequestContext,
    promotionService: PromotionService,
    promotionId: ID,
    conditions: PromotionConditionInput[],
    mode: ConditionsMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<ConfigurableOperationInput[] | null> {
    if (mode === 'SKIP') {
        return null; // Signal no update
    }

    const newConditions = buildConfigurableOperations(conditions);

    if (mode === 'REPLACE_ALL') {
        return newConditions;
    }

    if (mode === 'MERGE') {
        // Merge: keep existing conditions, add new ones
        const promotion = await promotionService.findOne(ctx, promotionId);
        if (!promotion?.conditions) {
            return newConditions;
        }

        const existingConditions = promotion.conditions.map(c => ({ code: c.code, arguments: c.args }));
        const merged = [...existingConditions, ...newConditions];
        logger.debug(`Merged ${existingConditions.length} existing + ${newConditions.length} new conditions = ${merged.length} total`);
        return merged;
    }

    return newConditions;
}

/** Handle promotion actions based on the specified mode. */
export async function handlePromotionActions(
    ctx: RequestContext,
    promotionService: PromotionService,
    promotionId: ID,
    actions: PromotionActionInput[],
    mode: ActionsMode = 'REPLACE_ALL',
    logger: DataHubLogger,
): Promise<ConfigurableOperationInput[] | null> {
    if (mode === 'SKIP') {
        return null; // Signal no update
    }

    const newActions = buildConfigurableOperations(actions);

    if (mode === 'REPLACE_ALL') {
        return newActions;
    }

    if (mode === 'MERGE') {
        // Merge: keep existing actions, add new ones
        const promotion = await promotionService.findOne(ctx, promotionId);
        if (!promotion?.actions) {
            return newActions;
        }

        const existingActions = promotion.actions.map(a => ({ code: a.code, arguments: a.args }));
        const merged = [...existingActions, ...newActions];
        logger.debug(`Merged ${existingActions.length} existing + ${newActions.length} new actions = ${merged.length} total`);
        return merged;
    }

    return newActions;
}
