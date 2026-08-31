import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideCopilotKit } from '@copilotkit/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Absolute, and cross-origin on purpose. No dev-server proxy: phase 2 swaps this one
    // line for an agent on another origin, so a proxy would be scaffolding to delete.
    provideCopilotKit({ runtimeUrl: 'http://localhost:8200/api/copilotkit' }),
  ],
};
