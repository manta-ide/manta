# AGENTS.md

A simple, open format for guiding coding agents, used by over 20k open-source projects.

## Setup commands

- Build: `npm run build`
- Lint: `npm run lint`

## Variable System Usage

This project uses a dynamic variable system for theming and configuration. Variables are stored in `_graph/vars.json` and automatically applied as CSS custom properties. The variables will be used once you build the graph, so the vars.json will be updated based on the graph, and you should implement all properties using the vars, or they won't be exposed to the user.

### How to use variables in components:

```typescript
import { subscribeVars } from './lib/varsHmr';

function MyComponent() {
  const [vars, setVars] = useState({});

  useEffect(() => {
    const unsubscribe = subscribeVars((newVars) => {
      setVars(newVars);
    });
    return unsubscribe;
  }, []);

  // Access variables directly from the vars object
  const brandName = vars['brand-name'];
  const isDarkTheme = vars['is-dark-theme'];

  return <div>{brandName}</div>;
}
```

### How to use CSS custom properties:

Variables are automatically applied as CSS custom properties with the `--` prefix:

```css
.my-element {
  color: var(--text-color);
  background: var(--background-color);
  font-family: var(--font-family);
}
```

### Variable categories:

- **Theme colors**: `background-color`, `text-color`, `accent-color`, `muted-color`, `border-color`
- **Typography**: `font-family`, `base-font-size`
- **Layout**: `max-content-width`, `section-padding-y`, `section-padding-x`
- **Styling**: `border-radius-global`, `is-dark-theme`
- **Content**: `brand-name`, `headline`, `subheadline`, `social-links`, etc.

### Publishing variable updates:

```typescript
import { publishVarsUpdate } from './lib/varsHmr';

// Update variables (will sync to parent and persist)
await publishVarsUpdate({
  'brand-name': 'New Company Name',
  'accent-color': '#ff6b6b'
});
```

## Important Guidelines

### ⚠️ Do NOT edit these directories directly:
- `/lib` - Contains core utility functions and variable management
- `/_graph` - Contains system configuration files (current-graph.xml, base-graph.xml vars.json, jobs.json)

### Instead:
- Modify variables through the provided APIs in your components
- Use `publishVarsUpdate()` to persist changes
- Let the system handle CSS custom property application automatically

### Code style
- TypeScript strict mode
- Functional patterns preferred
- Use the variable system for theming instead of hardcoded values
- Keep components responsive and accessible

### Development workflow
- Variables update in real-time during development
- Changes are automatically reflected in the UI
- No need to restart the dev server for variable changes
- Use the browser dev tools to inspect CSS custom properties

## Testing instructions

- Run `npm run lint` before committing
- Test variable updates in both development and production modes
- Verify CSS custom properties are applied correctly
- Check responsive behavior across different screen sizes

## PR guidelines

- Always run `npm run lint` before pushing
- Test variable functionality thoroughly
- Include screenshots for visual changes
- Document any new variables added to the system
