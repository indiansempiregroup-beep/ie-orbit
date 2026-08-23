---
name: Nexus Ledger
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#454652'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#757684'
  outline-variant: '#c5c5d4'
  surface-tint: '#4355b9'
  primary: '#24389c'
  on-primary: '#ffffff'
  primary-container: '#3f51b5'
  on-primary-container: '#cacfff'
  inverse-primary: '#bac3ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#603b00'
  on-tertiary: '#ffffff'
  tertiary-container: '#805000'
  on-tertiary-container: '#ffc988'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dee0ff'
  primary-fixed-dim: '#bac3ff'
  on-primary-fixed: '#00105c'
  on-primary-fixed-variant: '#293ca0'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  container-max: 1280px
  gutter: 16px
---

## Brand & Style
The design system is engineered for a dual-sided ecosystem where high-stakes business management meets seamless consumer commerce. The aesthetic is **Corporate Modern** with a focus on high-density information architecture that remains approachable.

For the Business Manager, the UI prioritizes **efficiency and utility**, using a structured grid to manage complex inventory and financial data. For the Consumer App, the system pivots toward **visual warmth and clarity**, utilizing more whitespace and larger touch targets.

The emotional response is one of absolute reliability. It avoids unnecessary decoration, relying instead on precise alignment, purposeful color application, and a tactile sense of depth that makes digital management feel as sturdy as physical bookkeeping.

## Colors
The palette is anchored by **Indigo-600 (#3F51B5)**, chosen for its psychological association with stability and institutional trust. 

- **Primary (Indigo):** Used for primary actions, navigation states, and brand headers.
- **Success (Emerald):** Specifically reserved for "Paid" statuses, "In Stock" indicators, and Royalty Points growth.
- **Warning/Pending (Amber):** Used for pending appointments and cautious inventory levels.
- **Danger (Red):** Strictly for "Unpaid" invoices, "Out of Stock" alerts, and destructive actions.
- **Neutrals:** A slate-based neutral scale ensures that text remains legible and interfaces feel sophisticated rather than stark black-and-white.

## Typography
This design system utilizes **Inter** for its exceptional legibility in UI contexts and its neutral, professional tone. 

A critical distinction in this system is the introduction of **JetBrains Mono** for numerical data, billing tables, and stock counts. This monospaced font ensures that digits align perfectly in columns, making financial scanning faster and reducing user error during rapid POS entries.

- **Headlines:** Use tighter letter-spacing for a modern, "tucked" look.
- **Body:** Standardized on 16px for desktop and 14px for dense mobile tables.
- **Labels:** Use uppercase for table headers and section overviews to create clear visual hierarchy.

## Layout & Spacing
The layout philosophy differs by platform:

- **Business Manager (Desktop/Tablet):** Employs a **12-column fluid grid**. Margins are kept tight (24px) to maximize the "data per square inch" (DSI). Content is organized into modular cards that can span 3, 4, 6, or 12 columns.
- **Consumer App (Mobile):** Employs a **4-column grid** with generous 16px gutters and 20px side margins. It uses a vertical "stack" rhythm to highlight products and booking slots.

The spacing scale is strictly **4px-based**. Use `md` (16px) for standard padding within cards and `lg` (24px) for spacing between major sections.

## Elevation & Depth
This design system uses **Tonal Layers** combined with **Ambient Shadows** to define the hierarchy of information.

- **Level 0 (Surface):** Background color (`#F8FAFC`).
- **Level 1 (Cards):** White background with a subtle 1px border (`#E2E8F0`) and a soft shadow (0px 1px 3px rgba(0,0,0,0.05)).
- **Level 2 (Modals/Dropdowns):** White background with a more pronounced shadow (0px 10px 15px -3px rgba(0,0,0,0.1)) to indicate an overlay state.

Avoid heavy black shadows; instead, use a slight blue tint in the shadow color to maintain brand harmony with the primary Indigo.

## Shapes
The shape language is **Soft-Rounded**. This strikes a balance between the precision of a business tool and the friendliness of a consumer app.

- **Standard Elements (Buttons, Inputs, Small Cards):** Use 8px (`rounded-md`).
- **Containers (Large Dashboard Cards, Promotional Banners):** Use 16px (`rounded-xl`).
- **Search Bars & Badges:** Use full-round (Pill) for high contrast against the rectilinear grid.

## Components
Consistent styling across both applications is maintained through these component definitions:

- **Buttons:**
    - **Primary:** Solid Indigo with white text. High contrast for "Generate Invoice" or "Pay Now."
    - **Success:** Solid Emerald for "Mark as Paid" or "Add Points."
    - **Ghost:** Indigo outline with transparent background for secondary actions like "View History."
- **Status Chips:**
    - Small, pill-shaped badges with 10% opacity backgrounds of their respective status color (e.g., a light green background with dark green text for "In Stock").
- **Input Fields:**
    - 8px rounded corners, 1px border. On focus, the border thickens to 2px Indigo with a soft outer glow.
- **Data Tables:**
    - Alternating row stripes (Zebra striping) are discouraged; use subtle horizontal dividers instead. Header cells use `label-caps` typography.
- **Appointment Cards:**
    - Include a vertical color-coded bar on the left edge to indicate state (e.g., Blue for "Scheduled," Amber for "In Progress," Green for "Completed").