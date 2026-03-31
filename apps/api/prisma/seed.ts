// apps/api/prisma/seed.ts

import {
  PrismaClient,
  DocumentRole,
  OrgRole,
  CommentStatus,
  AIJobStatus,
  AIOperation,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data (dev only)
  await prisma.auditLog.deleteMany();
  await prisma.aIJobApplication.deleteMany();
  await prisma.aIJob.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.documentPermission.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.documentInvite.deleteMany();
  await prisma.document.deleteMany();
  await prisma.organizationMember.deleteMany();
  await prisma.organizationInvite.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();

  // Org
  const org = await prisma.organization.create({
    data: { name: "Seed Org" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  // Users
  const orgOwner = await prisma.user.create({
    data: { name: "Org Owner", email: "owner@org.com", password: passwordHash },
  });

  const orgAdmin = await prisma.user.create({
    data: { name: "Org Admin", email: "admin@example.com", password: passwordHash },
  });

  const docOwner = await prisma.user.create({
    data: { name: "Document Owner", email: "owner@example.com", password: passwordHash },
  });

  const editor = await prisma.user.create({
    data: { name: "Editor User", email: "editor@example.com", password: passwordHash },
  });

  const commenter = await prisma.user.create({
    data: { name: "Commenter User", email: "commenter@example.com", password: passwordHash },
  });

  const viewer = await prisma.user.create({
    data: { name: "Viewer User", email: "viewer@example.com", password: passwordHash },
  });

  // Memberships
  await prisma.organizationMember.createMany({
    data: [
      { orgId: org.id, userId: orgOwner.id, orgRole: OrgRole.OrgOwner },
      { orgId: org.id, userId: orgAdmin.id, orgRole: OrgRole.OrgAdmin },
      { orgId: org.id, userId: docOwner.id, orgRole: null },
      { orgId: org.id, userId: editor.id, orgRole: null },
      { orgId: org.id, userId: commenter.id, orgRole: null },
      { orgId: org.id, userId: viewer.id, orgRole: null },
    ],
  });

  // Document
  const doc = await prisma.document.create({
    data: {
      orgId: org.id,
      title: "Seeded Document",
      content: "Hello from seed. This is a collaborative doc.",
      ownerId: docOwner.id,
    },
  });

  const v1 = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      parentVersionId: null,
      content: doc.content,
      authorId: docOwner.id,
      reason: "checkpoint",
    },
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: { headVersionId: v1.id },
  });

  // Permissions
  await prisma.documentPermission.createMany({
    data: [
      {
        documentId: doc.id,
        principalType: "user",
        principalId: docOwner.id,
        role: DocumentRole.Owner,
      },
      {
        documentId: doc.id,
        principalType: "user",
        principalId: editor.id,
        role: DocumentRole.Editor,
      },
      {
        documentId: doc.id,
        principalType: "user",
        principalId: commenter.id,
        role: DocumentRole.Commenter,
      },
      {
        documentId: doc.id,
        principalType: "user",
        principalId: viewer.id,
        role: DocumentRole.Viewer,
      },
      {
        documentId: doc.id,
        principalType: "link",
        principalId: "link_token_example_123",
        role: DocumentRole.Viewer,
      },
    ],
  });

  // Comments
  const ownerComment = await prisma.comment.create({
    data: {
      documentId: doc.id,
      authorId: docOwner.id,
      body: "Owner comment: please review this opening line.",
      anchorStart: 0,
      anchorEnd: 5,
      status: CommentStatus.open,
    },
  });

  const commenterComment = await prisma.comment.create({
    data: {
      documentId: doc.id,
      authorId: commenter.id,
      body: "This is a seeded comment anchored to text.",
      anchorStart: 0,
      anchorEnd: 5,
      status: CommentStatus.open,
    },
  });

  const editorGeneralComment = await prisma.comment.create({
    data: {
      documentId: doc.id,
      authorId: editor.id,
      body: "This is a general comment with no anchor.",
      status: CommentStatus.open,
    },
  });

  await prisma.comment.create({
    data: {
      documentId: doc.id,
      authorId: docOwner.id,
      parentCommentId: commenterComment.id,
      body: "Owner reply: thanks, I will update this section.",
      anchorStart: commenterComment.anchorStart,
      anchorEnd: commenterComment.anchorEnd,
      status: CommentStatus.open,
    },
  });

  // AI Job
  const job = await prisma.aIJob.create({
    data: {
      documentId: doc.id,
      userId: editor.id,
      operation: AIOperation.summarize,
      selectionStart: 0,
      selectionEnd: 20,
      parameters: { tone: "neutral" },
      basedOnVersionId: v1.id,
      status: AIJobStatus.succeeded,
      result: "Seeded AI summary result.",
    },
  });

  await prisma.aIJobApplication.create({
    data: {
      aiJobId: job.id,
      appliedById: editor.id,
      finalText: "Seeded AI summary result (accepted).",
      newVersionId: null,
    },
  });

  // Audit logs
  await prisma.auditLog.createMany({
    data: [
      {
        orgId: org.id,
        userId: docOwner.id,
        actionType: "DOCUMENT_CREATED",
        documentId: doc.id,
        metadata: { title: doc.title },
      },
      {
        orgId: org.id,
        userId: docOwner.id,
        actionType: "PERMISSION_GRANTED",
        documentId: doc.id,
        metadata: { principalType: "user", principalId: editor.id, role: "Editor" },
      },
      {
        orgId: org.id,
        userId: commenter.id,
        actionType: "COMMENT_CREATED",
        documentId: doc.id,
        metadata: { commentId: commenterComment.id },
      },
      {
        orgId: org.id,
        userId: editor.id,
        actionType: "AI_JOB_APPLIED",
        documentId: doc.id,
        metadata: { aiJobId: job.id },
      },
    ],
  });

  console.log("Seed complete.");
  console.log({
    orgId: org.id,
    orgOwner: orgOwner.email,
    orgAdmin: orgAdmin.email,
    docOwner: docOwner.email,
    editor: editor.email,
    commenter: commenter.email,
    viewer: viewer.email,
    documentId: doc.id,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });