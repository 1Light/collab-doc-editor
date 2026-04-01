// apps/api/src/integrations/emailService.ts

import nodemailer from "nodemailer";
import { Resend } from "resend";

console.log("[emailService] EMAIL_PROVIDER:", process.env.EMAIL_PROVIDER ?? "not set");
console.log("[emailService] resend configured:", Boolean(process.env.RESEND_API_KEY));
console.log(
  "[emailService] gmail configured:",
  Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
);
console.log("[emailService] EMAIL_FROM:", process.env.EMAIL_FROM);

type OrgInviteEmailParams = {
  to: string;
  inviteLink: string;
  orgName?: string;
  invitedByName?: string;
  orgRole?: "Member" | "OrgAdmin";
  expiresAt?: string | Date;
};

type DocumentInviteEmailParams = {
  to: string;
  inviterName: string;
  documentTitle: string;
  documentLink: string;
  message?: string;
};

const resend =
  process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

const transporter =
  process.env.EMAIL_PROVIDER === "gmail" &&
  process.env.GMAIL_USER &&
  process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })
    : null;

const FROM =
  process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim().length > 0
    ? process.env.EMAIL_FROM
    : process.env.GMAIL_USER && process.env.GMAIL_USER.trim().length > 0
      ? process.env.GMAIL_USER
      : "noreply@localhost";

/**
 * Internal send function.
 * Priority:
 * 1. Gmail SMTP if EMAIL_PROVIDER=gmail
 * 2. Resend if configured
 * 3. Console fallback in dev
 */
async function sendEmail(params: { to: string; subject: string; html: string }) {
  const to = (params.to ?? "").trim();

  console.log("[emailService] sendEmail called:", {
    to,
    subject: params.subject,
    provider: process.env.EMAIL_PROVIDER ?? (resend ? "resend" : "fallback"),
  });

  if (!to || !to.includes("@")) {
    const err = new Error(`Invalid recipient email: "${params.to}"`);
    console.error("[emailService] invalid recipient", err.message);
    throw err;
  }

  try {
    if (process.env.EMAIL_PROVIDER === "gmail") {
      if (!transporter) {
        throw new Error(
          "EMAIL_PROVIDER is set to gmail, but GMAIL_USER or GMAIL_APP_PASSWORD is missing."
        );
      }

      const info = await transporter.sendMail({
        from: FROM,
        to,
        subject: params.subject,
        html: params.html,
      });

      console.log("[emailService] gmail response:", {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
      });

      return;
    }

    if (resend) {
      const out = await resend.emails.send({
        from: FROM,
        to,
        subject: params.subject,
        html: params.html,
      });

      console.log("[emailService] resend response:", out);
      return;
    }

    console.log("==== EMAIL (DEV FALLBACK) ====");
    console.log("From:", FROM);
    console.log("To:", to);
    console.log("Subject:", params.subject);
    console.log("HTML:", params.html);
    console.log("================================");
  } catch (e: any) {
    console.error("[emailService] send failed:", e?.message ?? e);
    if (e?.response) console.error("[emailService] provider response:", e.response);
    if (e?.data) console.error("[emailService] provider data:", e.data);
    throw e;
  }
}

function formatExpiry(value?: string | Date) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value?: string | null) {
  if (!value) return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildInfoRow(label: string, value: string) {
  return `
    <tr>
      <td style="padding:0 0 10px 0; vertical-align:top; width:140px;">
        <span style="font-size:12px; line-height:18px; color:#6b7280; font-weight:600;">
          ${escapeHtml(label)}
        </span>
      </td>
      <td style="padding:0 0 10px 0; vertical-align:top;">
        <span style="font-size:14px; line-height:22px; color:#111827;">
          ${escapeHtml(value)}
        </span>
      </td>
    </tr>
  `;
}

function buildEmailLayout(params: {
  eyebrow: string;
  title: string;
  intro: string;
  detailsHtml?: string;
  messageHtml?: string;
  buttonLabel: string;
  buttonLink: string;
  fallbackText?: string;
}) {
  const eyebrow = escapeHtml(params.eyebrow);
  const title = escapeHtml(params.title);
  const intro = escapeHtml(params.intro);
  const buttonLabel = escapeHtml(params.buttonLabel);
  const buttonLink = escapeHtml(params.buttonLink);
  const fallbackText = escapeHtml(
    params.fallbackText ?? "If you did not expect this email, you can safely ignore it."
  );

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f5f5f4;">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
          ${title}
        </div>

        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="background-color:#f5f5f4; margin:0; padding:32px 16px; width:100%;"
        >
          <tr>
            <td align="center">
              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="max-width:640px; margin:0 auto;"
              >
                <tr>
                  <td style="padding:0 0 14px 4px;">
                    <div
                      style="
                        font-family:Inter, Arial, Helvetica, sans-serif;
                        font-size:12px;
                        line-height:18px;
                        letter-spacing:0.12em;
                        text-transform:uppercase;
                        color:#6b7280;
                        font-weight:700;
                      "
                    >
                      Workspace
                    </div>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      background:#ffffff;
                      border:1px solid #e7e5e4;
                      border-radius:20px;
                      padding:40px 36px;
                      box-shadow:0 8px 30px rgba(17, 24, 39, 0.05);
                    "
                  >
                    <div
                      style="
                        font-family:Inter, Arial, Helvetica, sans-serif;
                        font-size:11px;
                        line-height:18px;
                        letter-spacing:0.14em;
                        text-transform:uppercase;
                        color:#9ca3af;
                        font-weight:700;
                        margin-bottom:12px;
                      "
                    >
                      ${eyebrow}
                    </div>

                    <h1
                      style="
                        margin:0 0 14px 0;
                        font-family:Georgia, 'Times New Roman', serif;
                        font-size:31px;
                        line-height:1.2;
                        color:#111827;
                        font-weight:700;
                      "
                    >
                      ${title}
                    </h1>

                    <p
                      style="
                        margin:0 0 24px 0;
                        font-family:Inter, Arial, Helvetica, sans-serif;
                        font-size:15px;
                        line-height:26px;
                        color:#4b5563;
                      "
                    >
                      ${intro}
                    </p>

                    ${
                      params.detailsHtml
                        ? `
                      <table
                        role="presentation"
                        cellpadding="0"
                        cellspacing="0"
                        border="0"
                        width="100%"
                        style="
                          width:100%;
                          border-collapse:collapse;
                          margin:0 0 18px 0;
                          padding:18px 20px;
                          background:#fafaf9;
                          border:1px solid #ece7e1;
                          border-radius:14px;
                        "
                      >
                        <tr>
                          <td style="padding:18px 20px;">
                            <table
                              role="presentation"
                              cellpadding="0"
                              cellspacing="0"
                              border="0"
                              width="100%"
                              style="width:100%; border-collapse:collapse;"
                            >
                              ${params.detailsHtml}
                            </table>
                          </td>
                        </tr>
                      </table>
                    `
                        : ""
                    }

                    ${
                      params.messageHtml
                        ? `
                      <div
                        style="
                          margin:0 0 24px 0;
                          padding:16px 18px;
                          background:#fcfcfb;
                          border-left:3px solid #d6d3d1;
                          border-radius:12px;
                          font-family:Inter, Arial, Helvetica, sans-serif;
                          font-size:14px;
                          line-height:24px;
                          color:#374151;
                        "
                      >
                        ${params.messageHtml}
                      </div>
                    `
                        : ""
                    }

                    <div style="margin:30px 0 28px 0;">
                      <a
                        href="${buttonLink}"
                        style="
                          display:inline-block;
                          padding:13px 22px;
                          border-radius:999px;
                          background:#111827;
                          color:#ffffff;
                          text-decoration:none;
                          font-family:Inter, Arial, Helvetica, sans-serif;
                          font-size:14px;
                          font-weight:600;
                          letter-spacing:0.01em;
                        "
                      >
                        ${buttonLabel}
                      </a>
                    </div>

                    <div
                      style="
                        margin-top:8px;
                        padding-top:22px;
                        border-top:1px solid #ece7e1;
                      "
                    >
                      <p
                        style="
                          margin:0 0 8px 0;
                          font-family:Inter, Arial, Helvetica, sans-serif;
                          font-size:12px;
                          line-height:20px;
                          color:#6b7280;
                          font-weight:600;
                        "
                      >
                        Open this link manually
                      </p>
                      <p
                        style="
                          margin:0;
                          font-family:Inter, Arial, Helvetica, sans-serif;
                          font-size:12px;
                          line-height:20px;
                          color:#6b7280;
                          word-break:break-all;
                        "
                      >
                        ${buttonLink}
                      </p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 10px 0 10px;">
                    <p
                      style="
                        margin:0;
                        text-align:center;
                        font-family:Inter, Arial, Helvetica, sans-serif;
                        font-size:12px;
                        line-height:20px;
                        color:#78716c;
                      "
                    >
                      ${fallbackText}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export const emailService = {
  /**
   * ORG INVITE EMAIL
   */
  async sendOrgInvite(params: OrgInviteEmailParams) {
    const orgName = params.orgName?.trim() || "your organization";
    const invitedByName = params.invitedByName?.trim();
    const roleLabel = params.orgRole ?? "Member";
    const expiresLabel = formatExpiry(params.expiresAt);

    const subject = `You're invited to join ${orgName}`;

    const detailsHtml = [
      buildInfoRow("Organization", orgName),
      invitedByName ? buildInfoRow("Invited by", invitedByName) : "",
      buildInfoRow("Role", roleLabel),
      expiresLabel ? buildInfoRow("Expires", expiresLabel) : "",
    ].join("");

    const html = buildEmailLayout({
      eyebrow: "Organization Invite",
      title: `Join ${orgName}`,
      intro:
        "You have been invited to join a shared workspace. Accept the invitation to access your organization and get started.",
      detailsHtml,
      buttonLabel: "Accept Invite",
      buttonLink: params.inviteLink,
      fallbackText: "If you did not expect this invitation, you can safely ignore this email.",
    });

    await sendEmail({ to: params.to, subject, html });
  },

  /**
   * DOCUMENT INVITE EMAIL
   */
  async sendDocumentInvite(params: DocumentInviteEmailParams) {
    const inviterName = params.inviterName?.trim() || "Someone";
    const documentTitle = params.documentTitle?.trim() || "Untitled document";
    const message =
      params.message && params.message.trim().length > 0 ? params.message.trim() : "";

    const subject = `${inviterName} invited you to collaborate`;

    const detailsHtml = [
      buildInfoRow("Invited by", inviterName),
      buildInfoRow("Document", documentTitle),
    ].join("");

    const html = buildEmailLayout({
      eyebrow: "Document Invitation",
      title: `Collaborate on "${documentTitle}"`,
      intro:
        "A document has been shared with you. Open the invitation to review the content and start collaborating.",
      detailsHtml,
      messageHtml: message
        ? `<span style="font-style:italic;">“${escapeHtml(message)}”</span>`
        : undefined,
      buttonLabel: "Open Invite",
      buttonLink: params.documentLink,
      fallbackText: "If you were not expecting this invitation, you can safely ignore this email.",
    });

    await sendEmail({ to: params.to, subject, html });
  },
};