import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { groupByStatus, type Task } from './task';
import { TaskCard } from './task-card';

@Component({
  selector: 'app-board',
  imports: [TaskCard],
  templateUrl: './board.html',
  styleUrl: './board.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  readonly tasks = input.required<readonly Task[]>();

  /** The three columns. `MiniBoard` renders the same grouping, smaller, inside the chat. */
  protected readonly grouped = computed(() => groupByStatus(this.tasks()));
}
