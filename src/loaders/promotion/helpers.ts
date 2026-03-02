import { ID, RequestContext, PromotionService, Promotion } from '@vendure/core';
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

/**
 * Handle promotion conditions based on the specified mode.
 *
 * @param ctx Request context
 * @param promotionService Promotion service instance
 * @param promotionId ID of the promotion to update
 * @param conditions New conditions from the import record
 * @param mode How to handle the conditions (REPLACE_ALL, MERGE, SKIP)
 * @param logger Logger instance
 * @returns ConfigurableOperationInput array to apply
 */
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

    const { buildConfigurableOperations } = await import('../shared-helpers.js');
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

        const existingConditions = promotion.conditions as unknown as ConfigurableOperationInput[];
        const merged = [...existingConditions, ...newConditions];
        logger.debug(`Merged ${existingConditions.length} existing + ${newConditions.length} new conditions = ${merged.length} total`);
        return merged;
    }

    return newConditions;
}

/**
 * Handle promotion actions based on the specified mode.
 *
 * @param ctx Request context
 * @param promotionService Promotion service instance
 * @param promotionId ID of the promotion to update
 * @param actions New actions from the import record
 * @param mode How to handle the actions (REPLACE_ALL, MERGE, SKIP)
 * @param logger Logger instance
 * @returns ConfigurableOperationInput array to apply
 */
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

    const { buildConfigurableOperations } = await import('../shared-helpers.js');
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

        const existingActions = promotion.actions as unknown as ConfigurableOperationInput[];
        const merged = [...existingActions, ...newActions];
        logger.debug(`Merged ${existingActions.length} existing + ${newActions.length} new actions = ${merged.length} total`);
        return merged;
    }

    return newActions;
}
