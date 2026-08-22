import { ProductCategory } from "./products";

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterGroup = {
  id: string;
  label: string;
  options: FilterOption[];
};

export const categoryFilters: Record<ProductCategory, FilterGroup[]> = {
  "Corporate Gifting": [
    {
      id: "price",
      label: "Price Range",
      options: [
        { label: "Under ₹2,000", value: "under_2000" },
        { label: "₹2,000 - ₹5,000", value: "2000_5000" },
        { label: "Above ₹5,000", value: "above_5000" },
      ],
    },
    {
      id: "minOrder",
      label: "Minimum Order",
      options: [
        { label: "No Minimum", value: "none" },
        { label: "10 - 49", value: "10_49" },
        { label: "50+", value: "50_plus" },
      ],
    },
  ],
  "Hardware & IT": [
    {
      id: "connectivity",
      label: "Connectivity",
      options: [
        { label: "Wireless", value: "wireless" },
        { label: "Wired", value: "wired" },
        { label: "Bluetooth", value: "bluetooth" },
      ],
    },
    {
      id: "type",
      label: "Type",
      options: [
        { label: "Peripherals", value: "peripherals" },
        { label: "Networking", value: "networking" },
        { label: "Printers", value: "printers" },
      ],
    },
  ],
  "Fragrance Gifting": [
    {
      id: "scent",
      label: "Scent Family",
      options: [
        { label: "Oud", value: "oud" },
        { label: "Citrus", value: "citrus" },
        { label: "Amber", value: "amber" },
        { label: "Musk", value: "musk" },
      ],
    },
    {
      id: "volume",
      label: "Volume",
      options: [
        { label: "50 ml", value: "50ml" },
        { label: "100 ml", value: "100ml" },
      ],
    },
  ],
  "Office Supplies": [
    {
      id: "type",
      label: "Type",
      options: [
        { label: "Writing", value: "writing" },
        { label: "Notebooks", value: "notebooks" },
        { label: "Desk", value: "desk" },
        { label: "Paper", value: "paper" },
      ],
    },
  ],
  "Printing & Branding": [
    {
      id: "customization",
      label: "Customization",
      options: [
        { label: "Embroidery", value: "embroidery" },
        { label: "Print", value: "print" },
        { label: "Laser Engraving", value: "laser_engraving" },
      ],
    },
  ],
};
