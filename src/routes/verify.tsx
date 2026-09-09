import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { VerificationPage } from "@/features/verification/VerificationPage";

export const Route = createFileRoute("/verify")({
  component: () => (
    <AppLayout>
      <VerificationPage />
    </AppLayout>
  ),
});
