export function getConfiguredRedisUrl(): string | undefined {
    const dataHubUrl = process.env.DATAHUB_REDIS_URL?.trim();
    if (dataHubUrl) return dataHubUrl;
    return process.env.REDIS_URL?.trim() || undefined;
}
