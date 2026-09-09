import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { SetupPage } from "@/features/setup/SetupPage";

export const Route = createFileRoute("/setup")({
  component: () => (
    <AppLayout>
      <SetupPage />
    </AppLayout>
  ),
});
