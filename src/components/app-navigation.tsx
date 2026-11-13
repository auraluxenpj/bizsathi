@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ring-offset-background: var(--background);
  --color-hero-scrim: var(--hero-scrim);
  --color-print-paper: var(--print-paper);
  --color-print-ink: var(--print-ink);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --print-paper: oklch(1 0 0);
  --print-ink: oklch(0 0 0);
  --radius: 1rem;
  --hero-scrim: oklch(0.18 0.03 160 / 60%);
  --background: oklch(0.984 0.008 160);
  --foreground: oklch(0.18 0.02 160);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.19 0.02 160);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.19 0.02 160);
  --primary: oklch(0.54 0.17 158);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.89 0.06 156);
  --secondary-foreground: oklch(0.16 0.03 160);
  --muted: oklch(0.97 0.01 160);
  --muted-foreground: oklch(0.46 0.04 160);
  --accent: oklch(0.95 0.02 160);
  --accent-foreground: oklch(0.18 0.02 160);
  --destructive: oklch(0.62 0.21 27.325);
  --destructive-foreground: oklch(0.99 0.003 160);
  --border: oklch(0.91 0.008 160);
  --input: oklch(0.97 0.006 160);
  --ring: oklch(0.68 0.07 156);
  --chart-1: oklch(0.57 0.18 158);
  --chart-2: oklch(0.64 0.14 32);
  --chart-3: oklch(0.48 0.1 210);
  --chart-4: oklch(0.8 0.16 78);
  --chart-5: oklch(0.76 0.17 48);
  --sidebar: oklch(0.14 0.08 160);
  --sidebar-foreground: oklch(0.98 0.008 160);
  --sidebar-primary: oklch(0.8 0.12 156);
  --sidebar-primary-foreground: oklch(0.14 0.08 160);
  --sidebar-accent: oklch(0.2 0.08 160);
  --sidebar-accent-foreground: oklch(0.98 0.008 160);
  --sidebar-border: oklch(0.24 0.04 160);
  --sidebar-ring: oklch(0.8 0.12 156);
}

.dark {
  --print-paper: oklch(1 0 0);
  --print-ink: oklch(0 0 0);
  --hero-scrim: oklch(0.18 0.03 160 / 60%);
  --background: oklch(0.13 0.03 160);
  --foreground: oklch(0.98 0.008 160);
  --card: oklch(0.16 0.02 160);
  --card-foreground: oklch(0.98 0.008 160);
  --popover: oklch(0.16 0.02 160);
  --popover-foreground: oklch(0.98 0.008 160);
  --primary: oklch(0.75 0.12 156);
  --primary-foreground: oklch(0.14 0.08 160);
  --secondary: oklch(0.22 0.04 160);
  --secondary-foreground: oklch(0.98 0.008 160);
  --muted: oklch(0.22 0.04 160);
  --muted-foreground: oklch(0.7 0.05 160);
  --accent: oklch(0.22 0.04 160);
  --accent-foreground: oklch(0.98 0.008 160);
  --destructive: oklch(0.7 0.2 27.325);
  --destructive-foreground: oklch(0.99 0.003 160);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.68 0.07 156);
  --chart-1: oklch(0.68 0.2 160);
  --chart-2: oklch(0.72 0.17 32);
  --chart-3: oklch(0.62 0.11 210);
  --chart-4: oklch(0.84 0.18 78);
  --chart-5: oklch(0.8 0.17 48);
  --sidebar: oklch(0.15 0.08 160);
  --sidebar-foreground: oklch(0.98 0.008 160);
  --sidebar-primary: oklch(0.77 0.12 156);
  --sidebar-primary-foreground: oklch(0.14 0.08 160);
  --sidebar-accent: oklch(0.2 0.08 160);
  --sidebar-accent-foreground: oklch(0.98 0.008 160);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.68 0.07 156);
}

@layer base {
  * {
    border-color: var(--border);
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    font-family: 'DM Sans', sans-serif;
    background:
      radial-gradient(circle at top left, rgba(16, 185, 129, 0.12), transparent 25%),
      linear-gradient(180deg, #f5faf7 0%, #f8faf9 100%);
    color: var(--foreground);
  }
}

.brand { font-family: 'Manrope', sans-serif; }
* { letter-spacing: 0; }

.sticker-preview { width: 260px; max-width: 100%; }
.barcode-sticker { display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; min-width: 0; padding: 1mm 2mm; background: var(--print-paper); color: var(--print-ink); }
.sticker-name { font-size: 8pt; line-height: 1.1; text-align: center; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sticker-code { font-family: monospace; font-size: 8pt; line-height: 1.1; overflow-wrap: anywhere; text-align: center; }
.sticker-price { font-size: 8pt; line-height: 1.1; }
.sticker-barcode { display: block; width: 100%; max-width: 100%; height: 12mm; flex-shrink: 0; }
.barcode-print-root { display: none; }
.barcode-label-page { display: grid; box-sizing: border-box; row-gap: 0; break-after: page; overflow: hidden; }
.barcode-label-page:last-child { break-after: auto; }

@media print {
  body:has(.barcode-print-root) { margin: 0; background: var(--print-paper); }
  body:has(.barcode-print-root) > :not(.barcode-print-root) { display: none !important; }
  .barcode-print-root { display: block; }
  .barcode-print-root, .barcode-print-root * { visibility: visible; }
  .barcode-label-pages { margin: 0; }
  .barcode-sticker { break-inside: avoid; }
}
@media print {
  body:has([aria-label="Business report print"]) > *:not(:has([aria-label="Business report print"])):not([aria-label="Business report print"]) { display: none; }
  body * { visibility: hidden; }
  [aria-label="Invoice receipt"], [aria-label="Invoice receipt"] * { visibility: visible; }
  [aria-label="Invoice receipt"] { position: absolute; left: 0; top: 0; width: 100%; max-width: none; }
}

@media print {
  [aria-label="Business report print"], [aria-label="Business report print"] * { visibility: visible; }
  [aria-label="Business report print"] { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; overflow: visible; }
  body:has([aria-label="Business report print"]) [role="dialog"] { position: absolute; inset: 0; transform: none; max-height: none; height: auto; overflow: visible; border: none; box-shadow: none; }
  [aria-label="Business report print"] thead { display: table-header-group; }
  [aria-label="Business report print"] tr { break-inside: avoid; }
  [aria-label="Business report print"] table { table-layout: fixed; }
  [aria-label="Business report print"] th, [aria-label="Business report print"] td { overflow-wrap: anywhere; }
}
