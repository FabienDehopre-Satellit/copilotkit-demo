# Context

Canonical vocabulary for the CopilotKit-for-Angular demo. Glossary only — no implementation
detail, no spec. If a term here has a synonym you were about to use, use the term here instead:
the words on stage, in the prompts, in the slides, and in the code are the same words.

## Task

The only entity on the board. A unit of work with an `id`, a `title`, a one-line `description`,
a `status`, and an `assignee`.

There is no Column entity, no Label, no due date, no priority. The board is a list of Tasks and
nothing else.

## Status

Which of the three stages a Task is at: `todo`, `doing`, or `done`.

Never called a *column* or a *lane*. The board renders one column per status, but the column is
a rendering of the status, not a thing in its own right — so the second noun is never introduced.

## Done

The terminal status. A Task that is `done` stays on the board.

There is no *archived* status and no soft delete. Removing a Task removes it.

## Assignee

The person a Task belongs to: a name, or `null` when nobody owns it yet.

Never called an *owner*. An unassigned Task has `assignee: null` — never the string
`"unassigned"`, which would be a value pretending to be an absence.

## Board

All Tasks, taken together. The Board is what the agent is shown and what the tools change; it is
not a separate entity with its own fields.

## Team directory

The list of Teammates. It lives outside the app, in a separate program the agent reaches over MCP —
the Board does not contain it and the app never stores it. The only way the agent learns what is in
the directory is by asking.

## Teammate

A person in the Team directory: a name, a team, and a free-text list of skills.

A Teammate is not an Assignee. An Assignee is a name written on a Task; a Teammate is an entry in
the directory. Nothing links the two but the name itself — no id, no reference, no join — so it is
the agent, in language, that decides a given Teammate is the person a Task should go to.

## Mutating tool

A tool the agent calls to change the Board: create, move, assign, or delete a Task. Every change
to the Board goes through one of these — the agent never edits the Board any other way.

## Rendering tool

A tool the agent calls purely to put something on screen in the chat. It changes nothing.

The distinction is the point: a tool is not only a way to *act*, it is also a way to *show*. A
rendering tool is never described as read-only or as a query — it renders.

## Beat

One demonstrated capability in the talk: a prompt typed on stage, and what the audience sees
happen. The running order is a list of beats.

## Seed

The fixed starting Board every run begins from. Restoring the Seed is what *reset* means.
