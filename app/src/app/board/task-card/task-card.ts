import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import type { Task } from '../../models/task';

@Component({
  selector: 'app-task-card',
  templateUrl: './task-card.html',
  styleUrl: './task-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCard {
  readonly task = input.required<Task>();
}
