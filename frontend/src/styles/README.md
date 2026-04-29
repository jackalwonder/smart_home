# Style Module Boundaries

The current stylesheet entry order is defined in `src/main.tsx` and should stay
stable unless a change is intentionally visual-regression tested.

- `theme.css`: design tokens, base colors, shared focus and surface primitives.
- `terminal.css`: terminal activation, pairing, bootstrap-token landing states.
- `layout.css`: application shell, navigation, responsive page frames.
- `home.css`: home overview, floorplan, device cards, and home-specific panels.
- `settings.css`: settings workspace, forms, tables, backups, and admin panels.
- `settings-terminal-delivery.css`: terminal delivery workbench styles split after
  `settings.css`; selectors retain their original base-before-responsive order.
- `editor.css`: editor workbench and canvas controls.
- `devices.css`: device catalog and device management views.

When splitting a large stylesheet, move selectors in small page-scoped groups and
keep import order explicit in `src/main.tsx`. Each split should run frontend
unit tests and Playwright smoke/E2E because selector order is part of the UI
contract.
