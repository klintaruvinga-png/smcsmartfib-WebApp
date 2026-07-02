---
name: SuperFIB Dashboard
description: Fintech trading dashboard with dark theme and gold accent
colors:
  primary: "#d8a35d"
  background: "#07111b"
  background-1: "#102033"
  background-2: "#17293f"
  background-3: "#20344d"
  foreground: "#ffffff"
  dim: "#c4d2e4"
  mute: "#9cb0c9"
  border: "rgba(164, 191, 223, 0.24)"
  border-2: "rgba(206, 223, 243, 0.34)"
  accent-2: "#f3d7ab"
  buy: "#46d19a"
  sell: "#ff9a92"
  warn: "#f1b65c"
  info: "#59a8ff"
  violet: "#9e8cff"
  foreground-variant: "#1a1208"
  secondary: "#17293f"
  secondary-foreground: "#ffffff"
  destructive: "#ff9a92"
  destructive-foreground: "#1a0808"
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  "2xl": "calc(var(--radius) + 8px)"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#1a1208"
    rounded: "{rounded.md}"
    padding: "16px 48px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "#1a0808"
    rounded: "{rounded.md}"
    padding: "16px 48px"
  button-outline:
    backgroundColor: "var(--bg)"
    textColor: "var(--foreground)"
    borderColor: "{colors.border}"
    rounded: "{rounded.md}"
    padding: "16px 48px"
---
# Design System: SuperFIB Dashboard

## 1. Overview

**Creative North Star: "The Charting Lighthouse"**

A dark‑mode fintech interface that feels like a steady lighthouse guiding traders through volatile markets. The visual language is built around disciplined contrast, purposeful accents, and smooth, purposeful motion. It avoids overly colorful or cluttered layouts, favoring a calm, professional aura.

**Key Characteristics:**
- High contrast dark background with gold‑amber accent (Golden Ember).
- Clear hierarchy driven by typography and spacing.
- Motion that respects reduced‑motion preferences.

## 2. Colors

A focused, restrained palette anchored by a gold‑amber accent.

### Primary
- **Golden Ember** (#d8a35d): Used for primary actions, highlights, and interactive elements.

### Background
- **Obsidian Depths** (#07111b): Main page background, provides deep contrast for content.
- **Midnight Slate 1** (#102033): Secondary surface, cards, panels.
- **Midnight Slate 2** (#17293f): Tertiary surface, hover states, subtle separation.
- **Midnight Slate 3** (#20344d): Lightest dark surface, used for inputs and forms.

### Neutral
- **Foreground** (#ffffff): Primary text.
- **Dim** (#c4d2e4): Secondary text, placeholders.
- **Mute** (#9cb0c9): Disabled text, subtle hints.
- **Border** (rgba(164,191,223,0.24)): Standard border colour.
- **Border‑2** (rgba(206,223,243,0.34)): Elevated border for focus.

### Accent & Status
- **Accent‑2** (#f3d7ab): Lighter variant for hover states.
- **Buy** (#46d19a): Positive action colour.
- **Sell** (#ff9a92): Negative action colour.
- **Warn** (#f1b65c): Warning colour.
- **Info** (#59a8ff): Informational colour.
- **Violet** (#9e8cff): Accent for secondary interactive elements.

## 3. Typography

- **Font family:** Inter (sans‑serif) for body, JetBrains Mono for code snippets.
- **Display:** Large, bold headings for dashboards, clamped to a maximum of 4.5rem.
- **Body:** 1rem‑1.125rem size, 1.5 line‑height, maximum line length 70 ch.
- **Labels:** Small caps, 0.875rem, uppercase for button labels.

## 4. Elevation

Depth is conveyed mainly through colour contrast and subtle shadows on interactive elements. No heavy drop shadows; elevation is flat by default with a soft inner glow on focus.

## 5. Components

### Buttons
- **Primary:** `bg-primary` with `text-primary-foreground`, rounded `{rounded.md}`, padding `16px 48px`.
- **Destructive:** `bg-destructive` with `text-destructive-foreground`, same shape.
- **Outline:** Transparent background, `border` colour, foreground text, same rounding.
- **Secondary / Ghost / Link:** Variants use accent colours and minimal background.

### Cards
- Background `{colors.background-1}`, rounded `{rounded.lg}`, subtle border `{colors.border}`.
- Hover lifts background slightly and adds a faint accent glow.

### Inputs
- Background `{colors.background-2}`, border `{colors.border}`, rounded `{rounded.sm}`.
- Focus ring uses `var(--info)`.

### Badges & Indicators
- **Buy badge:** `bg-buy` with white text, small pulse animation.
- **Sell badge:** `bg-sell` with white text.
- **Warning badge:** `bg-warn`.

## 6. Do's and Don'ts

**Do:**
- Use the **Golden Ember** accent sparingly (≤10 % of screen area) to draw attention to primary actions.
- Maintain a contrast ratio of ≥4.5:1 for body text against the dark background.
- Respect reduced‑motion preferences; replace animations with instant state changes.
- Keep spacing consistent using the `spacing` scale (8 px – 16 px) for padding and margins.

**Don't:**
- Use overly colorful or cluttered layouts.
- Apply side‑stripe borders greater than 1 px as decorative accents.
- Employ gradient text or glass‑morphism as default UI elements.
- Stack identical card grids without hierarchy.
- Add tiny uppercase tracked eyebrows above every section.

