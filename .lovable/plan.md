OfficeNeed Navbar Navigation Data Update

Goal
Update the existing OfficeNeed homepage navigation catalog data only — no hero, layout, or styling changes.

Changes

1. Update `src/lib/navigation.ts`

- Reorder the category array so the primary header reads:
  1. Officeneed Exclusive
  2. Corporate Gifting
  3. Fragrance & Luxury Gifting
  4. Office Stationery
  5. Hardware Supplies (renamed from "IT Infrastructure")

- In the "Hardware Supplies" category (formerly IT Infrastructure), remove the item "Mousepads" from its `items` list.

- In the "Fragrance & Luxury Gifting" category:
  - Remove "Fragrances" from the `items` list.
  - Add "Eastern Perfumes" and "Western Perfumes" as new items.
  - Keep "Perfumes", "Premium Gifts", and "Luxury Gifting" untouched.

- Preserve the `hiddenFromPrimaryNav: true` flag on "Printing & Branding" so it stays hidden from the primary header but remains available in mega menus/search.

- Keep the existing `NavCategory` type as-is.

2. Verification

- Run the dev build check to confirm no TypeScript/import errors.
- Spot-check the preview on desktop and mobile to confirm the new category order, renamed label, and item list appear correctly in the navbar and mega menus.

Out of scope
- No changes to `Navbar.tsx`, `Hero.tsx`, `styles.css`, or any other route/page.
- No new components, images, or backend logic.
