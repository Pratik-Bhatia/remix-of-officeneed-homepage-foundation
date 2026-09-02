# Friendly empty state for missing taxonomy mappings

## Goal
When a visitor lands on `/products?missingMapping=...` (a nav category/subcategory that isn't yet mapped to a Shopify collection), show a friendly, shopper-facing empty state with guidance — instead of the current developer-facing "Configuration Missing" message that references Shopify collections and taxonomy handles.

## Current behavior
- `src/routes/products.index.tsx` lines 318–324 render a "Configuration Missing" block that names `missingMapping` and tells the reader to "create a collection in Shopify and map its handle in the taxonomy." This is internal jargon, not something a shopper should see.
- The page H1 (line 225) currently shows the raw `missingMapping` string. That label is actually a human-readable category/item name from `src/lib/taxonomy.ts`, so it's fine to keep as the heading — no change needed there.

## Changes (single file: `src/routes/products.index.tsx`)

### 1. Replace the "Configuration Missing" block with a friendly empty state
Replace the block at lines 318–324 with a centered, premium-styled empty state consistent with the page's existing design language (`font-display`, `text-foreground`, `text-muted-foreground`, `bg-secondary/20`, rounded borders):

- **Icon:** a soft `lucide-react` icon (e.g. `PackageSearch` or `Search`) in a circular `bg-secondary` badge, sized modestly.
- **Heading:** friendly copy, e.g. "This collection is coming soon" (not "Configuration Missing").
- **Body:** shopper-friendly explanation with no internal terms, e.g. "We're curating something special for this category. In the meantime, explore our other collections or get in touch and we'll help you find what you need."
- **Guidance actions:** two buttons laid out like the rest of the site:
  - "Browse all products" → `Link` to `/products` (clears the `missingMapping`).
  - "Talk to us" → opens the existing enquiry/contact path (link to `/contact-us`).

### 2. Keep the empty-collection state friendly too
The existing "There are currently no products available in this category." message (line 340–343) is already shopper-friendly; leave it as-is. Only the `missingMapping` branch changes.

## Non-goals
- No changes to `src/lib/taxonomy.ts` or `src/lib/navigation.ts` (the mapping logic and how `missingMapping` is produced stay the same).
- No changes to the page heading, navbar, filters, search, or product grid rendering.
- No new dependencies.

## Verification
- `bunx tsgo --noEmit -p tsconfig.json` passes.
- Playwright: navigate to `/products?missingMapping=Gift%20Sets` (or any unmapped item) and confirm the friendly empty state renders with both guidance buttons and no "Shopify"/"taxonomy"/"handle" text visible to the shopper.
