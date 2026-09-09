import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AssetRegister } from "@/features/assets/AssetRegister";

export const Route = createFileRoute("/assets")({
  component: () => (
    <AppLayout>
      <AssetRegister />
    </AppLayout>
  ),
});
