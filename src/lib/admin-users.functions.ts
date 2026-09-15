import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/types";

/**
 * Creates a user without any private server key, so it works on every host
 * (Lovable preview, published site, Vercel, custom domain).
 *
 * 1. Registers the account through the public sign-up endpoint with a throwaway
 *    password (raw fetch, so the current admin's own session is untouched).
 * 2. Fills in name, department, line manager and role through an admin-only
 *    database function.
 * 3. Emails the person a link to create their own password.
 */

const SUPABASE_URL = (import.meta.env['VITE_SUPABASE_URL'] as string) ?? "";
const SUPABASE_KEY =
  ((import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ??
    import.meta.env['VITE_SUPABASE_ANON_KEY']) as string) ?? "";

function throwawayPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return (
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "Aa1!"
  );
}

export type CreateUserInput = {
  email: string;
  full_name: string;
  department: string | null;
  manager_id: string | null;
  role: AppRole;
};

export type CreateUserResult = {
  id: string;
  email: string;
  invited: boolean;
  message: string;
};

export async function createUserAsAdmin(
  input: CreateUserInput,
): Promise<CreateUserResult> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name.trim();
  if (!email || !fullName) throw new Error("Name and email are required.");
  if (!SUPABASE_URL || !SUPABASE_KEY)
    throw new Error("The app is not connected to the backend on this site.");

  const { data: exists, error: existsErr } = await supabase.rpc(
    "admin_email_exists",
    { _email: email },
  );
  if (existsErr) throw new Error(existsErr.message);
  if (exists) throw new Error(`A user with the email ${email} already exists.`);

  const origin = window.location.origin.replace(/\/$/, "");

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({
      email,
      password: throwawayPassword(),
      data: { full_name: fullName },
      gotrue_meta_security: {},
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    id?: string;
    user?: { id?: string };
    msg?: string;
    error_description?: string;
    message?: string;
  };

  if (!res.ok) {
    const raw = payload.msg ?? payload.error_description ?? payload.message ?? "";
    throw new Error(
      /already|registered|exists/i.test(raw)
        ? `A user with the email ${email} already exists.`
        : raw || "Could not create the account.",
    );
  }

  const newId = payload.id ?? payload.user?.id ?? "";
  if (!newId)
    throw new Error(
      "The account was created but no id came back. Refresh the users list and set the role manually.",
    );

  const { error: finalizeErr } = await supabase.rpc("admin_finalize_user", {
    _user_id: newId,
    _email: email,
    _full_name: fullName,
    _department: input.department,
    _manager_id: input.manager_id,
    _role: input.role,
  } as never);
  if (finalizeErr) throw new Error(finalizeErr.message);

  const { error: mailErr } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  return {
    id: newId,
    email,
    invited: !mailErr,
    message: mailErr?.message ?? "",
  };
}
