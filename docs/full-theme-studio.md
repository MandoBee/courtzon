# Full Appearance Studio control

CourtZon is migrating so **published theme tokens** drive almost all UI colors, not hardcoded Tailwind grays.

## What is already wired

1. **Published theme API** (`/public/theme`) → `applyPublishedTheme()` injects CSS variables.
2. **Light / dark** schemes via `#cz-theme-light-vars` and `#cz-theme-dark-vars` (survives user theme toggle).
3. **Shared tokens** (brand, component `button-*`, `form-control-*`, radii, fonts) via `#cz-theme-shared-vars`.
4. **Tailwind palette remap** (`frontend/tailwind.config.js`): `gray`, `green`, `red`, `blue`, `yellow`, `amber` utilities use `var(--color-*)`.
5. **Native** `input`, `textarea`, `select` (except `.unstyled`) use form-control tokens from `index.css`.
6. **UI primitives**: `Button`, `Input`, `Card`, `Badge`, `Modal` use `cz-*` + CSS variables.

## What Appearance Studio controls

| Tab | Controls |
|-----|----------|
| **Global → Theme colors** | Background, text, borders, status tints, shadows (separate **Light** / **Dark**) |
| **Global → Brand** | Primary, secondary, accent |
| **Global → Typography / radius / shadow / gradient** | Fonts, corners, elevation |
| **Components** | Per-component size, color, radius (buttons, inputs, tables, sidebar, …) |

Always **Save draft** → **Publish** for users to see changes.

## Remaining exceptions (not from studio)

- **Literal hex** in charts, QR codes, product variant swatches, CMS embeds.
- **`text-white` / `bg-white`** on buttons (intentional contrast; not remapped).
- **`.unstyled`** inputs/selects (opt out of global form styling).
- **Landing CMS blocks** with inline styles from content.
- **Legacy DB keys** with underscores (`primary_color`) — ignored at runtime.

## Conventions for new UI

```tsx
// Surfaces
className="bg-[var(--color-bg)]"
className="bg-[var(--color-surface)] border border-[var(--color-border)]"

// Or Tailwind (mapped to same tokens)
className="bg-gray-50 text-gray-600 border-gray-200"

// Status
className="bg-cz-success text-cz-success"
// or bg-green-100 text-green-700 (mapped)

// Forms: use Input component or plain <input> (auto-themed)
<Input label="Name" />
```

Avoid new hardcoded `bg-gray-800` **unless** you rely on the remapped palette (which is fine).

## Phased file migration (optional cleanup)

Priority order for replacing one-off classes with semantic tokens:

1. High-traffic: `OrganisationForm.tsx`, `BranchListPage.tsx`, `BookingModal.tsx`, `ResourceListPage.tsx`
2. Admin tables: replace `hover:bg-gray-50` → already themed via gray scale
3. Replace `bg-white dark:bg-gray-800` on inputs with bare `<input>` or `Input` (global CSS handles it)

## Verify after publish

1. Publish a obvious change (e.g. bright primary + dark navy background).
2. Toggle profile **light / dark** — both schemes should persist.
3. Spot-check admin list, booking flow, marketplace.

## Troubleshooting

- **Toggle dark mode resets colors** — fixed: theme store no longer clears published schemes.
- **Change not visible** — Publish, hard refresh, clear `localStorage` key `cz_theme`.
- **Only preview updates** — you saved draft but did not Publish.
