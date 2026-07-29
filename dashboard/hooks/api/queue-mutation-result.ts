export function requireSuccessfulQueueMutation(
    result: boolean,
    errorMessage: string,
): true {
    if (!result) {
        throw new Error(errorMessage);
    }
    return true;
}
