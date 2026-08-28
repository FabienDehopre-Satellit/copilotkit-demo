// PROTOTYPE — throwaway. Issue #14: in a two-tool-call turn, what Board does
// the model see when it fires the second call, and when does the UI catch up?
import { Component, signal, computed } from '@angular/core';
import { CopilotChat, connectAgentContext, registerFrontendTool } from '@copilotkit/angular';
import { z } from 'zod';

type Task = { id: string; title: string; assignee: string | null };

@Component({
  selector: 'app-root',
  imports: [CopilotChat],
  template: `
    <div style="display:flex;gap:2rem;font-family:system-ui">
      <div style="flex:1">
        <h2>Board (rev {{ rev() }})</h2>
        <ul>
          @for (t of board(); track t.id) {
            <li>{{ t.id }} — {{ t.title }} — <b>{{ t.assignee ?? 'unassigned' }}</b></li>
          }
        </ul>
        <h3>Timeline</h3>
        <pre style="background:#eee;padding:.5rem;font-size:12px">{{ timeline().join('\n') }}</pre>
      </div>
      <div style="width:420px;height:90vh"><copilot-chat /></div>
    </div>
  `,
})
export class App {
  readonly rev = signal(0);
  readonly board = signal<Task[]>([
    { id: 'T-1', title: 'Draft onboarding copy', assignee: 'Amira' },
    { id: 'T-2', title: 'Build the profile page', assignee: 'Chloé' },
  ]);
  readonly timeline = signal<string[]>([]);

  private readonly serialised = computed(
    () => `REV=${this.rev()} ` + this.board().map((t) => `${t.id}:${t.assignee ?? 'none'}`).join(','),
  );

  constructor() {
    // The accessor form (#3): re-read at every run start, not snapshotted once.
    connectAgentContext(() => {
      const value = this.serialised();
      this.log(`context READ -> ${value}`);
      return { description: 'The task board', value };
    });

    registerFrontendTool({
      name: 'assignTask',
      description: 'Assign a task to a person.',
      parameters: z.object({ id: z.string(), assignee: z.string() }),
      handler: async ({ id, assignee }) => {
        this.log(`assignTask(${id}, ${assignee}) — handler entered`);
        this.board.update((b) => b.map((t) => (t.id === id ? { ...t, assignee } : t)));
        this.rev.update((r) => r + 1);
        this.log(`assignTask done -> ${this.serialised()}`);
        return `Assigned ${id} to ${assignee}`;
      },
    });
  }

  private log(line: string) {
    const stamp = new Date().toISOString().slice(11, 23);
    this.timeline.update((l) => [...l, `${stamp}  ${line}`]);
    console.log(`[app] ${stamp} ${line}`);
  }
}
