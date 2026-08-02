import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HTTP } from '../constants/defaults/http-defaults';
import {
    createPinnedAddressLookup,
    resolveSafeRemoteAddresses,
} from './remote-host-security.utils';

export type AwsRequestHandlerFactory = typeof createPinnedAwsRequestHandler;

export async function createPinnedAwsRequestHandler(
    endpoint: string | undefined,
): Promise<NodeHttpHandler | undefined> {
    if (!endpoint) return undefined;

    const url = new URL(endpoint);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('AWS-compatible endpoint must use http or https');
    }
    if (url.username || url.password) {
        throw new Error('AWS-compatible endpoint must not contain URL credentials');
    }

    const remotes = await resolveSafeRemoteAddresses(url.hostname);
    const agentOptions = {
        lookup: createPinnedAddressLookup(remotes),
    };
    const transportOptions = {
        connectionTimeout: HTTP.CONNECTION_TEST_TIMEOUT_MS,
        socketTimeout: HTTP.TIMEOUT_MS,
    };

    return new NodeHttpHandler(
        url.protocol === 'https:'
            ? {
                ...transportOptions,
                httpsAgent: new HttpsAgent(agentOptions),
            }
            : {
                ...transportOptions,
                httpAgent: new HttpAgent(agentOptions),
            },
    );
}
