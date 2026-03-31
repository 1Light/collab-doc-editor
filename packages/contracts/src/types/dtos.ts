import type { DocumentRole, OrgRole } from "../constants/roles";
import type { ErrorCode } from "../constants/errorCodes";

/* =========================
   Common
========================= */

export type ID = string;
export type ISODateString = string;

/* =========================
   Auth
========================= */

export interface LoginRequestDTO {
  email: string;
  password: string;
}

export interface LoginResponseDTO {
  accessToken: string;
  expiresIn: number;
  user: {
    id: ID;
    name: string;
    email: string;
    orgRole: OrgRole;
    orgId?: ID | null;
  };
}

export interface MeResponseDTO {
  id: ID;
  name: string;
  email: string;
  orgRole: OrgRole;
  orgId: ID | null;
}

/* =========================
   Documents
========================= */

export interface CreateDocumentRequestDTO {
  title: string;
}

export interface CreateDocumentResponseDTO {
  id: ID;
  title: string;
  ownerId: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface DocumentListItemDTO {
  id: ID;
  title: string;
  ownerId: ID;
  updatedAt: ISODateString;
  role: DocumentRole | null;
}

export type ListDocumentsResponseDTO = DocumentListItemDTO[];

export interface GetDocumentResponseDTO {
  id: ID;
  title: string;
  content: string;
  versionHeadId: ID | null;
  updatedAt: ISODateString;
  role: DocumentRole;
}

export interface UpdateDocumentRequestDTO {
  content: string;
}

export interface UpdateDocumentResponseDTO {
  id: ID;
  updatedAt: ISODateString;
  versionHeadId: ID;
}

export interface DeleteDocumentResponseDTO {
  deleted: boolean;
}

export interface ExportDocumentRequestDTO {
  format: "pdf" | "docx";
}

export interface ExportDocumentResponseDTO {
  downloadUrl: string;
  format: "pdf" | "docx";
  filename: string;
}

/* =========================
   Versions
========================= */

export interface VersionDTO {
  versionId: ID;
  createdAt: ISODateString;
  authorId: ID;
  summary?: string;
}

export interface RevertVersionResponseDTO {
  newHeadVersionId: ID;
}

/* =========================
   Sharing & Permissions
========================= */

export type ShareTargetType = "user" | "link";

export interface ShareDocumentRequestDTO {
  targetType: ShareTargetType;
  targetId?: ID;
  role: DocumentRole;
}

export interface PermissionDTO {
  principalType: ShareTargetType;
  principalId: ID;
  role: DocumentRole;
}

export interface ShareDocumentResponseDTO {
  shareId: ID;
  linkToken?: string;
}

/* =========================
   Comments
========================= */

export interface CommentAnchorDTO {
  start: number;
  end: number;
}

export type CommentStatus = "open" | "resolved";

export interface CreateCommentRequestDTO {
  body: string;
  anchor?: CommentAnchorDTO;
}

export interface CommentDTO {
  commentId: ID;
  documentId: ID;
  authorId: ID;
  body: string;
  anchor?: CommentAnchorDTO;
  status: CommentStatus;
  createdAt: ISODateString;
  updatedAt?: ISODateString;
  resolvedBy?: ID;
  resolvedAt?: ISODateString;
}

export interface DeleteCommentResponseDTO {
  deleted: boolean;
}

/* =========================
   AI Jobs
========================= */

export type AIOperation =
  | "rewrite"
  | "summarize"
  | "translate"
  | "reformat";

export interface CreateAIJobRequestDTO {
  documentId: ID;
  operation: AIOperation;
  selection: {
    start: number;
    end: number;
  };
  parameters?: {
    tone?: string;
    language?: string;
    formatStyle?: string;
  };
}

export type AIJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export interface AIJobResponseDTO {
  jobId: ID;
  status: AIJobStatus;
  result?: string;
  error?: {
    code: ErrorCode;
    message: string;
  };
  createdAt: ISODateString;
}

export interface ApplyAIJobRequestDTO {
  finalText: string;
}

export interface ApplyAIJobResponseDTO {
  versionHeadId: ID;
  updatedAt: ISODateString;
}

/* =========================
   Admin
========================= */

export interface UpdateAIPolicyRequestDTO {
  enabledRoles: DocumentRole[];
  quotaPolicy: {
    perUserPerDay?: number;
    perOrgPerDay?: number;
  };
}

export interface UpdateAIPolicyResponseDTO {
  updatedAt: ISODateString;
}

export interface AuditLogDTO {
  id: ID;
  userId: ID;
  actionType: string;
  documentId?: ID;
  metadata?: Record<string, unknown>;
  createdAt: ISODateString;
}

/* =========================
   Standard API Error
========================= */

export interface ApiErrorDTO {
  code: ErrorCode;
  message: string;
  details?: unknown;
}