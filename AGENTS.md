# AGENTS.md

## Formatting & Style

- **Brace Style**: Stroustrup style strictly (`else`, `catch`, `finally` on a new line after the closing brace).
- **Indentation**: Tabs. Exception: YAML files must use spaces because YAML forbids tabs for indentation.
- **Semicolons**: Always explicit.
- **Quotes**: Double quotes (`"`) for strings, backticks (`` ` ``) for templates.
- **Arrow functions**: Avoid, unless used as oneliners.
- **CSS**: Use BEM naming for CSS classes (`block`, `block__element`, `block--modifier`, `block__element--modifier`).

---

## TypeScript Guidelines

- **Strict Types**: No `any`. Use `unknown` for dynamic data and narrow with runtime guards/schemas.
- **Explicit Returns**: Always specify return types on exported and public functions.
- **Immutability**: Use `readonly` and `as const` for fixed configurations.

---

## Node.js Guidelines

- **Imports**: ESM syntax. Prefix Node built-in modules with `node:` (e.g., `node:fs/promises`).
- **Async**: Use `async`/`await` over standard Promise chains.
- **Errors**: Throw custom `Error` classes. Never swallow errors in empty `catch` blocks.

---

## Version control Guidelines

- **Commits**: Use ´[$TERM] ´ prefix for commits. For the $TERM, use "Conventional Commits" specification, in uppercase.
- **Commit messages**: Be concise.
