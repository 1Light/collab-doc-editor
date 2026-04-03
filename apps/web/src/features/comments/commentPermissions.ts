import type { Comment } from "./api";

export type DocumentRole = "Viewer" | "Commenter" | "Editor" | "Owner" | null;

export function canComment(role: DocumentRole) {
  return role === "Owner" || role === "Editor" || role === "Commenter";
}

export function canModerateComments(role: DocumentRole) {
  return role === "Owner" || role === "Editor";
}

export function canEditThisComment(opts: {
  meId?: string;
  comment: Comment;
}) {
  const { meId, comment } = opts;
  const isAuthor = Boolean(meId) && comment.authorId === meId;
  return isAuthor && comment.status === "open";
}

export function canDeleteThisComment(opts: {
  role: DocumentRole;
  meId?: string;
  comment: Comment;
}) {
  const { role, meId, comment } = opts;
  const isOwner = role === "Owner";
  const isAuthor = Boolean(meId) && comment.authorId === meId;

  if (isOwner) return true;
  if (isAuthor && comment.status === "open") return true;
  return false;
}

export function canReplyToComment(role: DocumentRole, comment: Comment) {
  return canComment(role) && comment.status === "open";
}