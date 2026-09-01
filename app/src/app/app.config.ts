import { HttpAgent } from '@ag-ui/client';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // The whole diff against `main`. The browser now talks straight to the C# agent on 8888,
    // with no Node tier in the path — which is why `main` never used a dev-server proxy.
    provideCopilotKit({
      selfManagedAgents: { default: new HttpAgent({ url: 'http://localhost:8888/' }) },
    }),
  ],
};
