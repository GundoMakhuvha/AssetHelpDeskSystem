import * as React from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import logoUrl from "@/assets/tipp-focus-logo.png";

export function LoginPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = React.useState("signin");

  React.useEffect(() => {
    if (!loading && user) nav({ to: "/" });
  }, [user, loading, nav]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div
        className="hidden lg:flex flex-col justify-between p-12 text-white"
        style={{ background: "var(--gradient-primary)" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-white p-1.5 shadow-md flex items-center justify-center">
            <img src={logoUrl} alt="Tipp Focus" className="h-full w-full object-contain" />
          </div>
          <div className="font-semibold">Tipp Focus Holdings</div>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight max-w-md">
            Assets & Help Desk System
          </h1>
          <p className="mt-3 text-white/80 max-w-md">
            Developed By: Gundo Makhuvha
          </p>
        </div>
        <div className="text-xs text-white/60">© Tipp Focus</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              
              <TabsContent value="signin"><SignInForm /></TabsContent>
              <TabsContent value="signup"><SignUpForm onDone={() => setTab("signin")} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nav = useNavigate();

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    nav({ to: "/" });
  };

  const reset = async () => {
    if (!email) return toast.error("Enter your email first");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  };

  return (
    <form onSubmit={handle} className="space-y-3 mt-2">
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Password</Label>
        <Input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Check your email to confirm (if required).");
    onDone();
  };

  return (
    <form onSubmit={handle} className="space-y-3 mt-2">
      <div className="space-y-1">
        <Label>Full name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Email</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Password</Label>
        <Input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        The first account created automatically becomes admin.
      </p>
    </form>
  );
}

export default LoginPage;