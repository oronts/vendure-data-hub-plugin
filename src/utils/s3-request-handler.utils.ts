import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
    createPinnedLookup,
    resolveSafeRemoteAddress,
} from './remote-host-security.utils';

export async function createPinnedS3RequestHandler(
    endpoint: string | undefined,
): Promise<NodeHttpHandler | undefined> {
    if (!endpoint) return undefined;

    const url = new URL(endpoint);
    const remote = await resolveSafeRemoteAddress(url.hostname);
    const agentOptions = { lookup: createPinnedLookup(remote) };

    return new NodeHttpHandler(
        url.protocol === 'https:'
            ? { httpsAgent: new HttpsAgent(agentOptions) }
            : { httpAgent: new HttpAgent(agentOptions) },
    );
}
