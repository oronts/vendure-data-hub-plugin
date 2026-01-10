/**
 * DataHub Dashboard Routes
 * Central export for all route definitions
 */

// Pipeline Routes
export { pipelinesList, pipelineDetail, pipelineRunsRoute } from './pipelines';

// Connection Routes
export { connectionsList, connectionDetail } from './connections';

// Secret Routes
export { secretsList, secretDetail } from './secrets';

// Adapter Routes
export { adaptersList } from './adapters';

// Queue Routes
export { queuesRoute } from './queues';

// Hooks & Events Routes
export { hooksRoute } from './hooks';

// Settings Routes
export { settingsRoute } from './settings';

// Logs Routes
export { logsRoute } from './logs';
