# Test plan

These are the behaviours that Detour promises, written as Gherkin so that a
manual pass and an automated case can share one description. A feature file
sits next to the surface it describes, and every scenario names what the reader
sees, never how the code is built.

The plan does not replace the automated suite. It says what must be true, and
the tags say who checks it today:

| Tag       | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `@unit`   | Vitest covers the behaviour. The case lives in `packages/extension/src`.                 |
| `@e2e`    | Playwright covers the behaviour against the unpacked build and the dummy server.         |
| `@manual` | Nothing automated covers it. A human runs it with the guide in `docs/manual-testing.md`. |
| `@visual` | The result is a layout, a colour, or a copy line, so it needs an eye on a screenshot.    |

A scenario may carry more than one tag. `@e2e @visual` means the flow is
automated but the layout still needs a look, because the automated case asserts
the DOM and not how it reads.

## Feature files

| File                                                  | Surface                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [decision.feature](features/decision.feature)         | The guard's decision, and every path that lets a page load  |
| [block-page.feature](features/block-page.feature)     | The block page: source card, walls, routes, search, actions |
| [toolbar.feature](features/toolbar.feature)           | The toolbar mark, its title, and the state it shows         |
| [popup.feature](features/popup.feature)               | The toolbar popup, its states, keys, and footer             |
| [options-page.feature](features/options-page.feature) | Allowances, walls table, reading settings, cache            |
| [lifecycle.feature](features/lifecycle.feature)       | List refresh, worker restarts, tab records, cache drops     |

## How to run a pass

1. Build and load the extension as `docs/manual-testing.md` says, with the real
   backend so the routes are real.
2. Walk the feature files in the order above. Each scenario states the state to
   reach and the result to see.
3. For a `@visual` scenario, check the layout against the numbers in the guide,
   at 1280 px and at 360 px, in the light and the dark theme.
4. Record what fails as a scenario number. The guide lists the evidence to
   attach: the screenshot, the console, the stored list identifier, and the
   build version.

## Adding a scenario

- One behaviour per scenario, and the name is the behaviour, not the control:
  `A route earns the no-walls claim only for the address the list clears`.
- The `Then` steps name something a reader can see, or a stored value a test can
  read through the extension. Never a module name, a CSS class, or a message
  name.
- Tag the scenario with what covers it today. A scenario that nothing covers is
  `@manual`, and the manual guide gains the steps that reach it.
- A change to a behaviour updates its scenario in the same pull request, the
  same way it updates the matching document.
