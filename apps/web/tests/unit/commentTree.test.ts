import { describe, it, expect } from "vitest";
import { normalizeCommentTree } from "../../src/features/comments/commentTree";

describe("normalizeCommentTree", () => {
  it("returns empty array for empty input", () => {
    expect(normalizeCommentTree([])).toEqual([]);
  });

  it("builds a tree from flat comments", () => {
    const input = [
      {
        commentId: "2",
        documentId: "doc-1",
        authorId: "user-2",
        body: "Reply",
        parentCommentId: "1",
        createdAt: "2026-03-28T10:05:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z",
      },
      {
        commentId: "1",
        documentId: "doc-1",
        authorId: "user-1",
        body: "Root",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z",
      },
    ] as any;

    const result = normalizeCommentTree(input);

    expect(result).toHaveLength(1);
    expect(result[0].commentId).toBe("1");
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies?.[0].commentId).toBe("2");
  });

  it("sorts root comments by createdAt ascending", () => {
    const input = [
      {
        commentId: "2",
        documentId: "doc-1",
        authorId: "user-2",
        body: "Later root",
        createdAt: "2026-03-28T10:10:00.000Z",
        updatedAt: "2026-03-28T10:10:00.000Z",
      },
      {
        commentId: "1",
        documentId: "doc-1",
        authorId: "user-1",
        body: "Earlier root",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z",
      },
    ] as any;

    const result = normalizeCommentTree(input);

    expect(result.map((c) => c.commentId)).toEqual(["1", "2"]);
  });

  it("sorts replies by createdAt ascending", () => {
    const input = [
      {
        commentId: "3",
        documentId: "doc-1",
        authorId: "user-3",
        body: "Later reply",
        parentCommentId: "1",
        createdAt: "2026-03-28T10:06:00.000Z",
        updatedAt: "2026-03-28T10:06:00.000Z",
      },
      {
        commentId: "2",
        documentId: "doc-1",
        authorId: "user-2",
        body: "Earlier reply",
        parentCommentId: "1",
        createdAt: "2026-03-28T10:05:00.000Z",
        updatedAt: "2026-03-28T10:05:00.000Z",
      },
      {
        commentId: "1",
        documentId: "doc-1",
        authorId: "user-1",
        body: "Root",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z",
      },
    ] as any;

    const result = normalizeCommentTree(input);

    expect(result[0].replies?.map((c) => c.commentId)).toEqual(["2", "3"]);
  });

  it("preserves already nested replies and clones deeply", () => {
    const input = [
      {
        commentId: "1",
        documentId: "doc-1",
        authorId: "user-1",
        body: "Root",
        createdAt: "2026-03-28T10:00:00.000Z",
        updatedAt: "2026-03-28T10:00:00.000Z",
        replies: [
          {
            commentId: "2",
            documentId: "doc-1",
            authorId: "user-2",
            body: "Reply",
            parentCommentId: "1",
            createdAt: "2026-03-28T10:05:00.000Z",
            updatedAt: "2026-03-28T10:05:00.000Z",
          },
        ],
      },
    ] as any;

    const result = normalizeCommentTree(input);

    expect(result).toHaveLength(1);
    expect(result[0].replies).toHaveLength(1);
    expect(result[0].replies?.[0].commentId).toBe("2");

    expect(result).not.toBe(input);
    expect(result[0]).not.toBe(input[0]);
    expect(result[0].replies).not.toBe(input[0].replies);
  });
});