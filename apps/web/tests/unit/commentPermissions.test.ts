import { describe, it, expect } from "vitest";
import {
  canComment,
  canModerateComments,
  canEditThisComment,
  canDeleteThisComment,
  canReplyToComment,
} from "../../src/features/comments/commentPermissions";

describe("commentPermissions", () => {
  const baseComment = {
    commentId: "c1",
    documentId: "doc-1",
    authorId: "user-1",
    body: "hello",
    status: "open",
    createdAt: "2026-03-28T10:00:00.000Z",
    updatedAt: "2026-03-28T10:00:00.000Z",
  } as any;

  it("canComment allows Owner, Editor, Commenter", () => {
    expect(canComment("Owner")).toBe(true);
    expect(canComment("Editor")).toBe(true);
    expect(canComment("Commenter")).toBe(true);
    expect(canComment("Viewer")).toBe(false);
    expect(canComment(null)).toBe(false);
  });

  it("canModerateComments allows Owner and Editor only", () => {
    expect(canModerateComments("Owner")).toBe(true);
    expect(canModerateComments("Editor")).toBe(true);
    expect(canModerateComments("Commenter")).toBe(false);
    expect(canModerateComments("Viewer")).toBe(false);
  });

  it("canEditThisComment allows only author and open comment", () => {
    expect(
      canEditThisComment({
        meId: "user-1",
        comment: baseComment,
      })
    ).toBe(true);

    expect(
      canEditThisComment({
        meId: "user-2",
        comment: baseComment,
      })
    ).toBe(false);

    expect(
      canEditThisComment({
        meId: "user-1",
        comment: { ...baseComment, status: "resolved" },
      })
    ).toBe(false);
  });

  it("canDeleteThisComment allows owner always", () => {
    expect(
      canDeleteThisComment({
        role: "Owner",
        meId: "user-2",
        comment: baseComment,
      })
    ).toBe(true);
  });

  it("canDeleteThisComment allows author if open", () => {
    expect(
      canDeleteThisComment({
        role: "Commenter",
        meId: "user-1",
        comment: baseComment,
      })
    ).toBe(true);
  });

  it("canDeleteThisComment blocks non-author non-owner", () => {
    expect(
      canDeleteThisComment({
        role: "Commenter",
        meId: "user-2",
        comment: baseComment,
      })
    ).toBe(false);
  });

  it("canDeleteThisComment blocks author if resolved", () => {
    expect(
      canDeleteThisComment({
        role: "Commenter",
        meId: "user-1",
        comment: { ...baseComment, status: "resolved" },
      })
    ).toBe(false);
  });

  it("canReplyToComment requires comment permission and open status", () => {
    expect(canReplyToComment("Editor", baseComment)).toBe(true);
    expect(canReplyToComment("Viewer", baseComment)).toBe(false);
    expect(canReplyToComment("Editor", { ...baseComment, status: "resolved" })).toBe(false);
  });
});