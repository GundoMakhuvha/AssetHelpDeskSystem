export type AppRole =
  | "admin"
  | "technician"
  | "asset_manager"
  | "asset_viewer"
  | "helpdesk_agent"
  | "requestor"
  | "viewer";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  technician: "Technician",
  asset_manager: "Asset Manager",
  asset_viewer: "Asset Viewer",
  helpdesk_agent: "Help Desk Agent",
  requestor: "Requestor",
  viewer: "Viewer (legacy)",
};

// Capability helpers — keep in sync with RLS in supabase migrations.
export const ROLES_ASSET_READ: AppRole[] = ["admin", "technician", "asset_manager", "asset_viewer", "viewer"];
export const ROLES_ASSET_WRITE: AppRole[] = ["admin", "technician", "asset_manager"];
export const ROLES_HELPDESK: AppRole[] = ["admin", "technician", "helpdesk_agent", "requestor", "viewer"];
export const ROLES_HELPDESK_AGENT: AppRole[] = ["admin", "technician", "helpdesk_agent"];

export type Department = "CSS" | "Finance" | "IT" | "Facilities" | "Tipp Con";
export const DEPARTMENTS: Department[] = ["CSS", "Finance", "IT", "Facilities", "Tipp Con"];

export type AssetCondition = "Good" | "Fair" | "Poor" | "Damaged";
export const CONDITIONS: AssetCondition[] = ["Good", "Fair", "Poor", "Damaged"];

export type TicketPriority = "Low" | "Medium" | "High" | "Critical";
export const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Critical"];

export type TicketStatus = "Open" | "In Progress" | "On Hold" | "Resolved" | "Closed";
export const STATUSES: TicketStatus[] = ["Open", "In Progress", "On Hold", "Resolved", "Closed"];

export type TicketCategory = string;
export const CATEGORIES: TicketCategory[] = ["Hardware", "Software", "Network", "Access", "Other"];

export interface TicketCategoryRow {
  id: string;
  name: string;
  description: string | null;
  default_priority: TicketPriority;
  is_active: boolean;
  sort_order: number;
}

export interface HelpdeskSettings {
  id: boolean;
  organisation_name: string;
  support_email: string | null;
  default_assignee: string | null;
  auto_close_days: number;
  business_start: string;
  business_end: string;
  working_days: number[];
  timezone: string;
  allow_attachments: boolean;
  require_category: boolean;
  notify_requestor: boolean;
  notify_agents: boolean;
  agent_notify_emails: string | null;
  ticket_footer: string | null;
}

export interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  level: "info" | "warning" | "critical";
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface ActivityLogRow {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  actor_email: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
}

export interface Asset {
  asset_id: string;
  barcode: string | null;
  serial_number: string | null;
  asset_description: string | null;
  assigned_to: string | null;
  location: string | null;
  department: Department | null;
  asset_condition: AssetCondition | null;
  last_verified_date: string | null;
  verified_by: string | null;
  returned_date: string | null;
  reallocated_to: string | null;
  is_deleted?: boolean | null;
  registration_date: string;
  created_at: string;
}

export interface Verification {
  id: string;
  asset_id: string;
  verified_by: string;
  verified_at: string;
  method: "barcode" | "manual";
  condition_at_verification: AssetCondition | null;
  notes: string | null;
}

export interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  description: string | null;
  submitted_by: string;
  assigned_to: string | null;
  department: Department | null;
  priority: TicketPriority;
  status: TicketStatus;
  category: TicketCategory;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  attachment_url?: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  department: string | null;
  role: AppRole | null;
  last_sign_in_at: string | null;
  user_created_at: string | null;
}

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}
