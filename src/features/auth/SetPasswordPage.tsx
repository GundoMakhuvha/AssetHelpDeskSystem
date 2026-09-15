import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/tipp-focus-logo.png";

type Redeemed = { email: string; temp_password: string };

export function SetPasswordPage() {
  const search = useSearch({ strict: false }) as { token?: string };
  const token = search?.token ?? "";
  const nav = useNavigate();

  const [pwd, setPwd] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return toast.error("This link is missing its invite code.");
    if (pwd !== confirm) return toast.error("The two passwords do not match.");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("redeem_setup_token" as never, {
        _token: token,
      } as never);
      if (error) throw new Error(error.message);
      const row = (data as unknown as Redeemed[])?.[0];
      if (!row) throw new Error("This link has already been used or has expired.");

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: row.email,
        password: row.temp_password,
      });
      if (signInErr) throw new Error(signInErr.message);

      const { error: updErr } = await supabase.auth.updateUser({ password: pwd });
      if (updErr) throw new Error(updErr.message);

      toast.success("Password created — welcome aboard.");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-2">
          <img src={logo} alt="Tipp Focus" className="h-10 mx-auto" />
          <CardTitle>Create your password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label>New password</Label>
              <Input type="password" minLength={8} required value={pwd}
                onChange={(e) => setPwd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Confirm password</Label>
              <Input type="password" minLength={8} required value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Create password & sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default SetPasswordPage;
