import type { Category } from "@fieldtime/shared";

// Job-specific configuration: the labels for the core's generic Group/Category
// fields and the starting category list. When the ConnectWise integration
// arrives, it will supply these instead.

export const profile = {
  groupLabel: "Client",
  categoryLabel: "Work Type",
  categories: [
    "Remote - Business Hours",
    "Onsite - Business Hours",
    "In-house - Business Hours",
    "Office",
    "Internal Meeting",
    "Internal Technical",
    "Communications",
    "Project Coordination",
    "SALES - Quoting",
    "Travel - To Client",
    "Travel - From Client",
    "Training - Providing",
  ],
};

export function seedCategories(): Category[] {
  return profile.categories.map((name, i) => ({
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    position: i,
    archived: false,
    rev: 0,
  }));
}
