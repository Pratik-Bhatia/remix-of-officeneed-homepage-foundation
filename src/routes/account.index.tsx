import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/account/")({
  staticData: { sitemap: false },
  beforeLoad: () => {
    throw redirect({ to: "/account/orders" });
  },
});
