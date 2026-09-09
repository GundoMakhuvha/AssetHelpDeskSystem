import * as React from "react";
import { useAuth } from "@/lib/auth-context";
import type { AppRole } from "@/lib/types";

export function RoleGate({
  allow,
  children,
  fallback,
}: {
  allow: AppRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { role } = useAuth();
  if (!role || !allow.includes(role)) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
