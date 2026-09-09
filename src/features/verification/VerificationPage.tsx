import * as React from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConditionBadge, VerifiedBadge } from "../shared/badges";
import { toast } from "sonner";
import { CONDITIONS, type Asset, type AssetCondition, type Verification } from "@/lib/types";
import { Camera, CameraOff, Search } from "lucide-react";
import { format } from "date-fns";

type VerificationWithAsset = Verification & { asset: Asset | null };

export function VerificationPage() {
  const { user, role } = useAuth();
  const canVerify = role === "admin" || role === "technician";
  const qc = useQueryClient();

  const [scanning, setScanning] = React.useState(false);
  const [lookup, setLookup] = React.useState("");
  const [asset, setAsset] = React.useState<Asset | null>(null);
  const [condition, setCondition] = React.useState<AssetCondition>("Good");
  const [notes, setNotes] = React.useState("");
  const [method, setMethod] = React.useState<"barcode" | "manual">("manual");
  const scannerRef = React.useRef<Html5Qrcode | null>(null);

  const { data: recent } = useQuery({
    queryKey: ["recent-verifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("verifications")
        .select(
          "*, asset:assets(asset_id, barcode, serial_number, asset_description, department, assigned_to, location, asset_condition, registration_date)",
        )
        .order("verified_at", { ascending: false })
        .limit(50);
      return (data ?? []) as VerificationWithAsset[];
    },
  });

  const findAsset = React.useCallback(async (code: string) => {
    const { data, error } = await supabase
      .from("assets").select("*")
      .or(`asset_id.eq.${code},barcode.eq.${code},serial_number.eq.${code}`)
      .eq("is_deleted", false).maybeSingle();
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error(`No asset found for "${code}"`); return; }
    const a = data as Asset;
    setAsset(a);
    setCondition((a.asset_condition ?? "Good") as AssetCondition);
    toast.success(`Found ${a.asset_id}`);
  }, []);

  const startScan = async () => {
    setScanning(true);
    setMethod("barcode");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const inst = new Html5Qrcode("scanner-region");
      scannerRef.current = inst;
      await inst.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        async (decoded) => {
          await stopScan();
          await findAsset(decoded.trim());
        },
        () => undefined,
      );
    } catch (e) {
      setScanning(false);
      toast.error("Camera unavailable. Use manual lookup.");
      console.error(e);
    }
  };

  const stopScan = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      }
    } catch { /* ignore */ }
    scannerRef.current = null;
    setScanning(false);
  };

  React.useEffect(() => () => { void stopScan(); }, []);

  const submitVerification = async () => {
    if (!asset || !user?.email) return;
    const nowIso = new Date().toISOString();
    const { error: insErr } = await supabase.from("verifications").insert({
      asset_id: asset.asset_id,
      verified_by: user.email,
      verified_at: nowIso,
      method,
      condition_at_verification: condition,
      notes: notes || null,
    });
    if (insErr) return toast.error(insErr.message);
    const { error: updErr } = await supabase
      .from("assets")
      .update({
        last_verified_date: nowIso,
        verified_by: user.email,
        asset_condition: condition,
      })
      .eq("asset_id", asset.asset_id);
    if (updErr) return toast.error(updErr.message);
    toast.success(`Verified ${asset.asset_id}`);
    setAsset(null); setNotes(""); setLookup("");
    qc.invalidateQueries({ queryKey: ["recent-verifications"] });
    qc.invalidateQueries({ queryKey: ["assets"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Asset Verification</h1>
        <p className="text-sm text-muted-foreground">Scan a barcode or look up an asset to record verification.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Scanner</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="aspect-video w-full bg-muted rounded-md overflow-hidden flex items-center justify-center">
              <div id="scanner-region" className="w-full h-full" />
              {!scanning && <div className="absolute text-sm text-muted-foreground">Camera off</div>}
            </div>
            <div className="flex gap-2">
              {scanning ? (
                <Button variant="secondary" onClick={stopScan}><CameraOff className="h-4 w-4 mr-2" />Stop</Button>
              ) : (
                <Button onClick={startScan} disabled={!canVerify}><Camera className="h-4 w-4 mr-2" />Start camera</Button>
              )}
            </div>

            <div className="border-t pt-4 space-y-2">
              <Label>Manual lookup</Label>
              <div className="flex gap-2">
                <Input placeholder="Asset ID or serial number" value={lookup}
                  onChange={(e) => setLookup(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setMethod("manual"); findAsset(lookup.trim()); } }} />
                <Button variant="secondary" onClick={() => { setMethod("manual"); findAsset(lookup.trim()); }}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Asset details</CardTitle></CardHeader>
          <CardContent>
            {!asset ? (
              <div className="text-sm text-muted-foreground">Scan or look up an asset to begin verification.</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Detail label="Asset ID" value={asset.asset_id} />
                  <Detail label="Serial" value={asset.serial_number} />
                  <Detail label="Description" value={asset.asset_description} />
                  <Detail label="Department" value={asset.department} />
                  <Detail label="Assigned to" value={asset.assigned_to} />
                  <Detail label="Location" value={asset.location} />
                  <Detail label="Registered" value={asset.registration_date ? format(new Date(asset.registration_date), "dd MMM yyyy") : "—"} />
                  <Detail label="Last verified" value={asset.last_verified_date ? format(new Date(asset.last_verified_date), "PPp") : "Never"} />
                  <div><div className="text-xs text-muted-foreground">Current condition</div><ConditionBadge value={asset.asset_condition} /></div>
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Label>Confirm condition</Label>
                  <Select value={condition} onValueChange={(v) => setCondition(v as AssetCondition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
                  <Button className="w-full" onClick={submitVerification} disabled={!canVerify}>
                    Confirm verification
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent verifications</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {!recent || recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifications yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Verified by</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.asset_id}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{v.asset?.asset_description ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{v.asset?.serial_number ?? "—"}</TableCell>
                    <TableCell>{v.asset?.department ?? "—"}</TableCell>
                    <TableCell>{v.asset?.assigned_to ?? "—"}</TableCell>
                    <TableCell>{v.asset?.location ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {v.asset?.registration_date ? format(new Date(v.asset.registration_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>{v.verified_by}</TableCell>
                    <TableCell className="capitalize">{v.method}</TableCell>
                    <TableCell><ConditionBadge value={v.condition_at_verification} /></TableCell>
                    <TableCell className="max-w-[220px] truncate" title={v.notes ?? ""}>{v.notes ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(v.verified_at), "PPp")}</TableCell>
                    <TableCell><VerifiedBadge date={v.verified_at} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}
