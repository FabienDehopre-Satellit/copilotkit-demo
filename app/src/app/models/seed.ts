import type { Task } from './task';

const rows = [
  {
    id: 'T-1',
    title: 'Design the welcome email',
    description: 'The first message a new hire gets, the morning they start.',
    status: 'todo',
    assignee: 'Amira',
  },
  {
    id: 'T-2',
    title: 'Import the HR spreadsheet',
    description: 'Load the starter list HR already keeps by hand.',
    status: 'todo',
    assignee: 'Chloé',
  },
  {
    id: 'T-3',
    title: 'Pick an SSO provider',
    description: 'Decide how a new hire signs in on day one.',
    status: 'todo',
    assignee: null,
  },
  {
    id: 'T-4',
    title: 'Build the profile page',
    description: 'Where a new hire fills in their own details.',
    status: 'doing',
    assignee: 'Amira',
  },
  {
    id: 'T-5',
    title: 'Write the equipment checklist',
    description: 'Laptop, badge, phone: what everyone gets on arrival.',
    status: 'doing',
    assignee: 'Bruno',
  },
  {
    id: 'T-6',
    title: 'Set up the staging environment',
    description: 'Somewhere to try the portal before HR sees it.',
    status: 'doing',
    assignee: 'Bruno',
  },
  {
    id: 'T-7',
    title: 'Register the domain',
    description: 'onboarding.example.com, pointed at nothing yet.',
    status: 'done',
    assignee: 'Dries',
  },
  {
    id: 'T-8',
    title: 'Draft the project brief',
    description: 'One page on scope, audience and deadline.',
    status: 'done',
    assignee: 'Chloé',
  },
] satisfies readonly Task[];

/**
 * The fixed starting Board every run begins from. Three properties are load-bearing and must not
 * drift: T-3 is unassigned, Bruno holds exactly T-5 and T-6, and T-7 is done and inert.
 *
 * Frozen one Task deep, not just the array: the Board signal starts out holding these very
 * objects, so an in-place write would rewrite the Seed and leave a reset restoring the damage.
 */
export const SEED_TASKS: readonly Task[] = Object.freeze(rows.map((row) => Object.freeze(row)));
