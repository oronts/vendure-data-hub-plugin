import { STEP_CONFIG_TRANSLATION_IDS, STEP_TYPE } from '../../../constants';
import type { TestResultMessage } from './step-test-types';

const DIRECTLY_TESTABLE_STEP_TYPES: ReadonlySet<string> = new Set([
    STEP_TYPE.EXTRACT,
    STEP_TYPE.TRANSFORM,
    STEP_TYPE.VALIDATE,
    STEP_TYPE.LOAD,
]);

export function canTestStepType(effectiveType: string): boolean {
    return DIRECTLY_TESTABLE_STEP_TYPES.has(effectiveType);
}

export function getFeedStepTestResult(): {
    status: 'warning';
    message: TestResultMessage;
} {
    return {
        status: 'warning',
        message: { id: STEP_CONFIG_TRANSLATION_IDS.FEED_PIPELINE_DRY_RUN },
    };
}
