import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { connectAgentContext, CopilotChat } from '@copilotkit/angular';

import { Board } from './board';
import { SEED_TASKS } from './seed';
import type { Task } from './task';

@Component({
  selector: 'app-root',
  imports: [Board, CopilotChat],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  /** The Board: all Tasks, in memory only. A reload is already a full reset. */
  protected readonly tasks = signal<readonly Task[]>(SEED_TASKS);

  constructor() {
    // The whole read channel: one entry, re-sent on every turn. The accessor is load-bearing —
    // connectAgentContext wraps an effect(), so a plain object would register once and never
    // follow the signal. Called from the constructor, so the injection context is implicit and
    // teardown rides DestroyRef.
    connectAgentContext(() => ({
      description: 'The current task board',
      value: JSON.stringify(this.tasks()),
    }));
  }
}
