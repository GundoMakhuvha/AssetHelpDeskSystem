import { createFileRoute } from "@tanstack/react-router";
import { SetPasswordPage } from "@/features/auth/SetPasswordPage";

export const Route = createFileRoute("/set-password")({
  component: SetPasswordPage,
  head: () => ({
    meta: [
      { title: "Create your password | Tipp Focus Help Desk" },
      {
        name: "description",
        content:
          "Set your own password to access the Tipp Focus Asset Management & Help Desk system.",
      },
      { property: "og:title", content: "Create your password | Tipp Focus Help Desk" },
      {
        property: "og:description",
        content: "Set your own password for the Tipp Focus Help Desk.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
