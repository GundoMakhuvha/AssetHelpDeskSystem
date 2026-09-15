import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-2xl w-full shadow-[var(--shadow-elegant)]">
        <CardHeader>
          <CardTitle className="text-2xl">Connect Tipp Focus to Supabase</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            This app connects to <strong>your own</strong> Supabase project. Set the following
            environment variables in <em>Project Settings → Environment Variables</em>:
          </p>
          <pre className="bg-muted rounded-md p-4 text-foreground text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...`}
          </pre>
          <p>
            Then run the SQL script in <code>supabase/schema.sql</code> in your Supabase SQL editor
            to create all tables, enums, RLS policies, and the auto-promote-first-admin trigger.
          </p>
          <p className="text-xs">After setting the env vars, refresh this page.</p>
        </CardContent>
      </Card>
    </div>
  );
}
