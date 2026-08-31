import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

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
}
