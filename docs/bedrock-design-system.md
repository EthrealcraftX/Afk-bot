# Minecraft Bedrock Web Design System

## 1. Complete Design System Overview
This design system translates the official Minecraft Bedrock Edition UI into a modern, responsive web application. It discards generic SaaS patterns, neon lighting, and glassmorphism in favor of flat panels, chunky borders, large click targets, and stone-inspired textures and colors. The goal is a highly readable, controller-friendly interface that feels like it was developed by Mojang.

## 2. Color Palette
The palette is derived from Minecraft's core materials (Stone, Dirt, Emerald, Redstone) but modernized for a clean web experience.

**Base & Backgrounds (Stone/Obsidian)**
- `--bg-root`: `#1D1D1D` (Dark stone/bedrock background)
- `--bg-panel`: `#313233` (Standard UI panel background)
- `--bg-panel-dark`: `#212121` (Recessed areas, log windows)

**Borders & Outlines**
- `--border-light`: `#58585A` (Top and left highlights for depth)
- `--border-dark`: `#1E1E1E` (Bottom and right shadows for depth)
- `--border-focus`: `#FFFFFF` (Thick white outline for focused/selected elements)

**Primary Actions (Emerald/Green)**
- `--btn-primary-bg`: `#3C8527`
- `--btn-primary-hover`: `#4B9F33`
- `--btn-primary-border-light`: `#5DB045`
- `--btn-primary-border-dark`: `#235214`
- `--btn-primary-text`: `#FFFFFF`

**Secondary Actions (Light Stone)**
- `--btn-secondary-bg`: `#D0D1D4`
- `--btn-secondary-hover`: `#E6E7E8`
- `--btn-secondary-border-light`: `#FFFFFF`
- `--btn-secondary-border-dark`: `#58585A`
- `--btn-secondary-text`: `#1D1D1D`

**Status Colors**
- `--status-error`: `#E02E2E` (Redstone)
- `--status-warn`: `#F2A100` (Gold)
- `--status-info`: `#2280E6` (Lapis)

## 3. Typography System
A strict split between headers (gaming aesthetic) and body (readability).

**Headers & Primary Nav (Minecraft Font)**
- Font Family: `'Minecraft', 'Press Start 2P', monospace`
- Usage: Page titles (H1), Card titles (H2), Primary Buttons, Main Sidebar links.
- Styling: Uppercase, slight text-shadow (`0 2px 0 rgba(0,0,0,0.5)`).

**Body & Data (Modern Sans-Serif)**
- Font Family: `'Inter', 'Segoe UI', sans-serif`
- Usage: Descriptions, log output, forms, settings, player counts.
- Weights: 400 (Regular), 600 (Semibold), 700 (Bold).

## 4. Spacing System
Spacing relies on a rigid 4px/8px grid to emulate the chunky, blocky nature of Minecraft.
- `--space-xs`: `4px` (Inner component spacing)
- `--space-sm`: `8px` (Icon to text spacing)
- `--space-md`: `16px` (Standard padding)
- `--space-lg`: `24px` (Panel padding)
- `--space-xl`: `32px` (Section spacing)

## 5. Component Library Details

### Buttons
Buttons must look like physical Minecraft buttons (slight 3D bevel).
- **Style**: Solid background, 3px solid dark border on bottom/right, 3px solid light border on top/left.
- **Hover**: Background lightens by 10%.
- **Active (Pressed)**: Background shifts down by 2px, borders invert (dark on top/left, light on bottom/right) to simulate a pressed state.
- **Focus**: Adds a 3px white outline around the entire button.

### Server Cards (World Selection Style)
- **Container**: Flat `#313233` panel, 3px dark border. No border radius (or very minimal, 2px).
- **Layout**: Horizontal on desktop. Left side: Server Icon (large square). Middle: Server Name (Minecraft font), Version, Status. Right side: Action buttons (Start, Stop, Edit).
- **Hover**: Subtle light border overlay.

### Forms & Inputs
- **Inputs**: Dark background (`#1D1D1D`), 3px inset shadow border. 
- **Text**: White. Focus adds a white outer border.

### Sidebar Navigation
- **Style**: Full height left panel. Darker than main content (`#212121`).
- **Links**: Large click targets. When selected, they gain a green left border (`4px solid var(--btn-primary-bg)`) and a lighter background.

## 12. UI Guidelines
- **No Border Radius**: UI elements should be perfectly rectangular or have a maximum 2px radius to maintain the blocky aesthetic.
- **High Contrast**: Text must clearly stand out against the dark stone backgrounds.
- **Monochrome with Accents**: Keep the interface mostly gray/stone. Use green, red, and blue only for actions, statuses, and notifications.

## 13. Interaction Guidelines
- **Controller-Friendly**: All interactive elements must be large enough for easy clicking (min 44x44px).
- **Obvious Focus**: Keyboard navigation must highlight elements with a thick white border, mimicking controller selection in Bedrock.
- **Feedback**: Every action must have an immediate visual change (button press depth, toast notification).

## 14. Animation Guidelines
- **Fast & Snappy**: Animations should be under 150ms. No long, swooping SaaS transitions.
- **Transitions**: Only animate `background-color`, `transform` (for button presses), and `opacity`.
- **Modals**: Modal dialogs should appear instantly or with a very fast scale-up (0.95 to 1.0 in 100ms).

## 15. CSS Architecture Recommendations
- Migrate to a BEM (Block Element Modifier) or strict modular CSS approach.
- Create a `theme.css` file strictly for the design tokens (colors, spacing, typography).
- Create component-specific CSS files (e.g., `button.css`, `card.css`, `sidebar.css`) instead of monolithic `styles.css`.
- Remove all glassmorphism, blur, and heavy box-shadow properties currently in the codebase.

## 16. Folder Structure for UI Components
To scale the UI, the frontend should be organized modularly:
```text
public/
├── css/
│   ├── base/        # Resets, typography, variables
│   ├── components/  # Buttons, cards, inputs, modals
│   └── layouts/     # Sidebar, grid, dashboard layout
├── js/
│   ├── components/  # JS for specific UI components
│   └── pages/       # JS specific to routes (dashboard, create)
├── index.html
└── ...
```

## 17. Explanation for Design Decisions
- **Removing Glassmorphism**: Minecraft is grounded in physical, opaque blocks. Frosted glass feels alien to the franchise.
- **Minecraft Font Restrictions**: While nostalgic, the Minecraft font is notoriously hard to read at small sizes or in dense paragraphs. Restricting it to headings ensures the "Mojang feel" without sacrificing UX and accessibility.
- **Chunky Borders**: Mimics the 3D bevel found in the official game UI.

## 18. Future Scalability Recommendations
- **Component Framework**: While Vanilla JS is currently used, migrating to Preact or Lit would allow encapsulating these highly specific UI behaviors (like the custom button press borders) into reusable components.
- **Spritesheets**: For icons, consider using an SVG spritesheet to easily style and scale icons without multiple HTTP requests.
- **Theming**: The token-based CSS architecture allows easily adding a "Light Mode" (classic Minecraft paper/book UI theme) in the future.
