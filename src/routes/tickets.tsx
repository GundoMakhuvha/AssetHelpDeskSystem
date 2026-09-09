import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { TicketsPage } from "@/features/tickets/TicketsPage";

export const Route = createFileRoute("/tickets")({
  component: () => (
    <AppLayout>
      <TicketsPage />
    </AppLayout>
  ),
});
