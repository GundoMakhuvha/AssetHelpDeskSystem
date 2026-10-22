import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { FileText, ImageIcon, Paperclip, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { TicketAttachment } from "@/lib/types";

export const ATTACHMENT_BUCKET = "ticket-attachments";
export const MAX_FILE_MB = 25;
const ACCEPT = "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.zip,.msg,.eml";

/** Storage keys reject spaces/odd characters on some setups — keep them simple. */
function safeName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_");
  return cleaned.slice(-120) || "file";
}

/** Older tickets stored a public URL (bucket is private, so it never opened). Recover the storage path. */
export function legacyPath(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return url; // already a path
  const m = url.match(/\/ticket-attachments\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export function displayName(path: string) {
  return path.split("/").pop()!.replace(/^\d+-/, "");
}

export function formatSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Opens a private file in a new tab via a short-lived signed URL.
 * The tab is opened synchronously so pop-up blockers allow it.
 */
export async function openAttachment(path: string) {
  const win = window.open("about:blank", "_blank");
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) {
    win?.close();
    toast.error("Could not open file: " + (error?.message ?? "not found or no access"));
    return;
  }
  if (win) {
    win.opener = null;
    win.location.href = data.signedUrl;
  } else {
    window.open(data.signedUrl, "_blank", "noopener");
  }
}

export interface UploadedFile {
  path: string;
  file: File;
}

/** Uploads files to storage under the user's folder. Failed files are reported and skipped. */
export async function uploadFiles(files: File[], folder: string): Promise<UploadedFile[]> {
  const done: UploadedFile[] = [];
  for (const file of files) {
    const path = `${folder}/${Date.now()}-${safeName(file.name)}`;
    const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      contentType: file.type || undefined,
    });
    if (up.error) {
      toast.error(`${file.name}: ${up.error.message}`);
      continue;
    }
    done.push({ path, file });
  }
  return done;
}

/** Records uploaded files against a ticket (and optionally a reply). */
export async function recordAttachments(opts: {
  ticketId: string;
  userId: string;
  uploaded: UploadedFile[];
  commentId?: string | null;
}) {
  if (!opts.uploaded.length) return;
  const { error } = await supabase.from("ticket_attachments").insert(
    opts.uploaded.map(({ path, file }) => ({
      ticket_id: opts.ticketId,
      comment_id: opts.commentId ?? null,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: opts.userId,
    })),
  );
  if (error) toast.error("Files uploaded but could not be linked to the ticket: " + error.message);
}

export function useTicketAttachments(ticketId: string) {
  return useQuery({
    queryKey: ["ticket_attachments", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_attachments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });
      if (error) return [] as TicketAttachment[]; // table not migrated yet — fail soft
      return (data ?? []) as TicketAttachment[];
    },
  });
}

/** Ticket ids that have at least one attachment (for the list indicator). */
export function useAttachmentCounts() {
  return useQuery({
    queryKey: ["ticket_attachments", "counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ticket_attachments").select("ticket_id");
      const counts: Record<string, number> = {};
      if (error) return counts;
      for (const r of (data ?? []) as { ticket_id: string }[]) {
        counts[r.ticket_id] = (counts[r.ticket_id] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function AttachmentChip({
  path,
  name,
  mime,
  size,
}: {
  path: string;
  name: string;
  mime?: string | null;
  size?: number | null;
}) {
  const isImage =
    (mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i.test(name);
  const Icon = isImage ? ImageIcon : FileText;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openAttachment(path);
      }}
      title={`Open ${name} in a new tab`}
      className="group inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:border-primary/50 hover:bg-primary/5 transition-colors"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate max-w-[220px] font-medium">{name}</span>
      {size ? <span className="text-muted-foreground">{formatSize(size)}</span> : null}
      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
    </button>
  );
}

export function AttachmentList({
  items,
}: {
  items: { path: string; name: string; mime?: string | null; size?: number | null }[];
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a) => (
        <AttachmentChip key={a.path} {...a} />
      ))}
    </div>
  );
}

/** Multi-file picker with a removable list of chosen files. */
export function FilePicker({
  files,
  onChange,
  compact = false,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  compact?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${f.name} is larger than ${MAX_FILE_MB} MB`);
        continue;
      }
      if (!next.some((x) => x.name === f.name && x.size === f.size)) next.push(f);
    }
    onChange(next);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => add(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        onClick={() => ref.current?.click()}
      >
        <Paperclip className="h-4 w-4 mr-1" /> Attach files
      </Button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span
              key={f.name + i}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3" />
              <span className="truncate max-w-[180px]">{f.name}</span>
              <span className="text-muted-foreground">{formatSize(f.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i))}
              >
                <X className="h-3 w-3 hover:text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
