import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { STATUSES, type Status, type Task } from './task';
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

  /** One group per status, in rendering order. A status with no Tasks still renders. */
  protected readonly grouped = computed<readonly { status: Status; tasks: readonly Task[] }[]>(() =>
    STATUSES.map((status) => ({
      status,
      tasks: this.tasks().filter((task) => task.status === status),
    })),
  );
}
