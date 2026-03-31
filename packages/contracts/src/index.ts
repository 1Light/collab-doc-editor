export * from "./constants/errorCodes";
export * from "./constants/roles";

export * from "./schemas/adminSchemas";
export * from "./schemas/aiSchemas";
export * from "./schemas/authSchemas";
export * from "./schemas/commentSchemas";
export * from "./schemas/documentSchemas";

/* DTOs (explicit export to avoid name collisions) */
export type {
  ID,
  ISODateString,

  LoginRequestDTO,
  LoginResponseDTO,
  MeResponseDTO,

  CreateDocumentRequestDTO,
  CreateDocumentResponseDTO,
  DocumentListItemDTO,
  ListDocumentsResponseDTO,
  GetDocumentResponseDTO,
  UpdateDocumentRequestDTO,
  UpdateDocumentResponseDTO,
  DeleteDocumentResponseDTO,
  ExportDocumentRequestDTO,
  ExportDocumentResponseDTO,

  VersionDTO,
  RevertVersionResponseDTO,

  ShareTargetType,
  ShareDocumentRequestDTO,
  PermissionDTO,
  ShareDocumentResponseDTO,

  CommentAnchorDTO,
  CommentDTO,
  CreateCommentRequestDTO,
  DeleteCommentResponseDTO,

  CreateAIJobRequestDTO,
  AIJobResponseDTO,
  ApplyAIJobRequestDTO,
  ApplyAIJobResponseDTO,

  UpdateAIPolicyRequestDTO,
  UpdateAIPolicyResponseDTO,
  AuditLogDTO,

  ApiErrorDTO
} from "./types/dtos";