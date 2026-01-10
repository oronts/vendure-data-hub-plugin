import { defineDashboardExtension } from '@vendure/dashboard';
import { Boxes } from 'lucide-react';
import { DATAHUB_NAV_SECTION } from './constants';
import {
    pipelinesList,
    pipelineDetail,
    adaptersList,
    secretsList,
    secretDetail,
    connectionsList,
    connectionDetail,
    hooksRoute,
    queuesRoute,
    settingsRoute,
    logsRoute,
} from './routes';

export default defineDashboardExtension({
    navSections: [
        { id: DATAHUB_NAV_SECTION, title: 'Data Hub', icon: Boxes, placement: 'bottom', order: 999 },
    ],
    routes: [
        pipelinesList,
        pipelineDetail,
        adaptersList,
        secretsList,
        secretDetail,
        connectionsList,
        connectionDetail,
        hooksRoute,
        queuesRoute,
        settingsRoute,
        logsRoute,
    ],
});
