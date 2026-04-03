import type { Comment } from "./api";

export type ReplyableComment = Comment & {
  parentCommentId?: string;
  replies?: ReplyableComment[];
};

function buildCommentTreeFromFlat(items: ReplyableComment[]): ReplyableComment[] {
  const map = new Map<string, ReplyableComment>();

  for (const item of items) {
    map.set(item.commentId, { ...item, replies: [] });
  }

  const roots: ReplyableComment[] = [];

  for (const item of map.values()) {
    if (item.parentCommentId && map.has(item.parentCommentId)) {
      map.get(item.parentCommentId)!.replies!.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

function sortRecursive(nodes: ReplyableComment[]) {
  nodes.sort((a, b) => {
    const at = new Date(a.createdAt).getTime();
    const bt = new Date(b.createdAt).getTime();
    return at - bt;
  });

  for (const node of nodes) {
    if (node.replies?.length) sortRecursive(node.replies);
  }
}

export function normalizeCommentTree(items: Comment[]): ReplyableComment[] {
  const normalized = (Array.isArray(items) ? items : []) as ReplyableComment[];

  if (normalized.length === 0) return [];

  const hasNestedReplies = normalized.some(
    (item) => Array.isArray(item.replies) && item.replies.length > 0
  );

  const tree = hasNestedReplies ? normalized : buildCommentTreeFromFlat(normalized);

  const cloneDeep = (node: ReplyableComment): ReplyableComment => ({
    ...node,
    replies: Array.isArray(node.replies) ? node.replies.map(cloneDeep) : [],
  });

  const cloned = tree.map(cloneDeep);
  sortRecursive(cloned);

  return cloned;
}