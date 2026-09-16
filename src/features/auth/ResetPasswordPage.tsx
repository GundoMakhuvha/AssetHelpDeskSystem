import * as React from "react";
import { useNavigate, useSearch, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/tipp-focus-logo.png";

export function ResetPasswordPage() {
  const search = useSearch({ strict: false }) as { token?: string };
  const [urlToken, setUrlToken] = React.useState("");
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const qs = new URLSearchParams(window.location.search);
    const hash = window.location.hash.includes("?")
      ? new URLSearchParams(window.location.hash.split("?")[1])
      : null;
    setUrlToken(qs.get("token") ?? hash?.get("token") ?? "");
  }, []);
  const token = search?.token ?? urlToken;
  const [pwd, setPwd] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const nav = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 8) return toast.error("Use at least 8 characters.");
    if (pwd !== confirm) return toast.error("The two passwords do not match.");
    setBusy(true);
    try {
      if (token) {
        const { data, error } = await supabase.rpc("redeem_password_reset" as never, {
          _token: token,
          _new_password: pwd,
        } as never);
        if (error) throw new Error(error.message);
        const email = data as unknown as string;
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email,
          password: pwd,
        });
        if (signInErr) {
          setDone(true);
          toast.success("Password updated — please sign in.");
          return;
        }
        toast.success("Password updated");
        nav({ to: "/" });
        return;
      }

      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        throw new Error(
          "This reset link is incomplete or has expired. Please request a new one from the sign-in page.",
        );
      }
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw new Error(error.message);
      toast.success("Password updated");
      nav({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center space-y-2">
          <img src={logo} alt="Tipp Focus" className="h-10 mx-auto" />
          <CardTitle>Set a new password</CardTitle>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                Your password has been updated. You can now sign in.
              </p>
              <Button asChild className="w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handle} className="space-y-3">
              <div className="space-y-1">
                <Label>New password</Label>
                <Input
                  type="password"
                  minLength={8}
                  required
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Confirm password</Label>
                <Input
                  type="password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ResetPasswordPage;
