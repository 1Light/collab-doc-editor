import { expect, test, type Page, type Route } from "@playwright/test";

const memberUser = {
  id: "user-1",
  name: "Red",
  email: "redclover3.14@gmail.com",
  orgRole: null,
  orgId: "org-1",
};

const documentList = [
  {
    id: "doc-1",
    title: "Launch Plan",
    ownerId: "user-1",
    updatedAt: "2026-04-10T12:00:00.000Z",
    role: "Owner",
  },
];

async function seedAuthenticatedSession(page: Page, user = memberUser) {
  await page.addInitScript((seedUser) => {
    const storage = (globalThis as typeof globalThis & { localStorage: Storage }).localStorage;
    storage.setItem("accessToken", "test-access-token");
    storage.setItem("me", JSON.stringify(seedUser));
    storage.setItem("orgId", seedUser.orgId ?? "");
  }, user);
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSession(page: Page, user = memberUser) {
  await page.route("**/api/auth/me", async (route) => {
    await fulfillJson(route, user);
  });
}

async function mockDocumentsApi(page: Page, docs = documentList) {
  await page.route("**/api/documents", async (route) => {
    if (route.request().method() === "GET") {
      await fulfillJson(route, docs);
      return;
    }

    if (route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { title?: string };
      await fulfillJson(route, {
        id: "doc-new",
        title: payload.title ?? "Untitled",
        ownerId: memberUser.id,
        createdAt: "2026-04-17T10:00:00.000Z",
        updatedAt: "2026-04-17T10:00:00.000Z",
      });
      return;
    }

    await route.fallback();
  });
}

async function mockEditorApi(page: Page) {
  await page.route("**/socket.io/**", async (route) => {
    await route.abort();
  });

  await page.route("**/api/documents/doc-*", async (route) => {
    const url = route.request().url();
    const isNewDoc = url.endsWith("/api/documents/doc-new");
    const method = route.request().method();

    if (method === "PUT") {
      await fulfillJson(route, {
        id: isNewDoc ? "doc-new" : "doc-1",
        updatedAt: "2026-04-10T12:10:00.000Z",
        versionHeadId: "ver-3",
      });
      return;
    }

    await fulfillJson(route, {
      id: isNewDoc ? "doc-new" : "doc-1",
      title: isNewDoc ? "AI Demo Notes" : "Launch Plan",
      content: isNewDoc ? "<p>AI Demo Notes</p>" : "<p>Quarterly planning draft.</p>",
      versionHeadId: "ver-2",
      updatedAt: "2026-04-10T12:00:00.000Z",
      role: "Owner",
    });
  });

  await page.route("**/api/documents/doc-1/comments**", async (route) => {
    await fulfillJson(route, []);
  });

  await page.route("**/api/documents/doc-1/versions**", async (route) => {
    await fulfillJson(route, [
      {
        versionId: "ver-2",
        createdAt: "2026-04-10T12:00:00.000Z",
        authorId: memberUser.id,
        authorName: memberUser.name,
        reason: "manual_save",
        isCurrent: true,
      },
      {
        versionId: "ver-1",
        createdAt: "2026-04-09T08:30:00.000Z",
        authorId: memberUser.id,
        authorName: memberUser.name,
        reason: "checkpoint",
        isCurrent: false,
      },
    ]);
  });

  await page.route("**/api/ai/history/doc-1**", async (route) => {
    await fulfillJson(route, [
      {
        jobId: "job-1",
        operation: "summarize",
        status: "succeeded",
        createdAt: "2026-04-10T12:05:00.000Z",
        author: {
          id: memberUser.id,
          name: memberUser.name,
          email: memberUser.email,
        },
        selection: {
          start: 0,
          end: 25,
          text: "Quarterly planning draft.",
        },
        prompt: "Summarize the selected text.",
        model: "mock-model",
        parameters: {
          summaryStyle: "short_paragraph",
        },
        decisionStatus: "accepted",
        result: "A short planning summary.",
        errorMessage: null,
        acceptedAt: "2026-04-10T12:06:00.000Z",
        acceptedById: memberUser.id,
        finalText: "A short planning summary.",
        applicationCount: 1,
      },
    ]);
  });

  await page.route("**/api/ai/jobs/stream", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'event: chunk',
        'data: {"chunk":"A shorter summary."}',
        "",
        'event: done',
        'data: {"jobId":"job-stream-1","result":"A shorter summary.","prompt":"Summarize the selected text.","model":"mock-model"}',
        "",
        "",
      ].join("\n"),
    });
  });

  await page.route("**/api/ai/jobs/job-stream-1/apply", async (route) => {
    await fulfillJson(route, {
      versionHeadId: "ver-3",
      updatedAt: "2026-04-10T12:10:00.000Z",
    });
  });
}

async function selectEditorText(page: Page, textToMatch: string, startOffset = 0, endOffset?: number) {
  await page.waitForFunction(() =>
    Boolean((globalThis as typeof globalThis & { __collabEditor?: unknown }).__collabEditor)
  );
  await page.evaluate(
    (payload) => {
      const editor = (globalThis as typeof globalThis & { __collabEditor?: any }).__collabEditor;
      if (!editor) {
        throw new Error("Editor instance not available");
      }

      editor.commands.setContent(`<p>${payload.textToMatch}</p>`);
      const start = 1 + payload.startOffset;
      const end =
        typeof payload.endOffset === "number"
          ? start + payload.endOffset
          : start + payload.textToMatch.length;

      editor.commands.focus();
      editor.commands.setTextSelection({ from: start, to: end });
    },
    { textToMatch, startOffset, endOffset }
  );
}

test.describe("project journeys", () => {
  test("user can sign in and land on the documents dashboard", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      const payload = route.request().postDataJSON() as { email?: string; password?: string };
      expect(payload.email).toBe(memberUser.email);
      expect(payload.password).toBe("secret123");

      await fulfillJson(route, {
        accessToken: "test-access-token",
        expiresIn: 1800,
        user: {
          ...memberUser,
        },
      });
    });

    await mockSession(page);
    await mockDocumentsApi(page);

    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(memberUser.email);
    await page.getByPlaceholder("••••••••").fill("secret123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
    await expect(page.getByText("Launch Plan")).toBeVisible();
  });

  test("user can create a document from the dashboard and open it", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockSession(page);
    await mockDocumentsApi(page);
    await mockEditorApi(page);

    await page.goto("/documents");
    await expect(page.getByText("Launch Plan")).toBeVisible();

    await page.getByRole("button", { name: "New document" }).click();
    await page.getByPlaceholder("Example: Q2 product brief").fill("AI Demo Notes");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(page.getByText("AI Demo Notes")).toBeVisible();

    await page.getByRole("button", { name: "Open" }).first().click();
    await expect(page).toHaveURL(/\/documents\/doc-new$/);
    await expect(page.getByRole("heading", { name: "AI Demo Notes", exact: true })).toBeVisible();
  });

  test("editor exposes version history and AI interaction history panels", async ({ page }) => {
    await seedAuthenticatedSession(page);
    await mockSession(page);
    await mockEditorApi(page);

    await page.goto("/documents/doc-1");

    await expect(page.getByRole("heading", { name: "Launch Plan", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Version History" }).click();
    await expect(page.getByText("Showing latest 2 versions")).toBeVisible();
    await expect(page.getByText("Current")).toBeVisible();

    await page.getByRole("button", { name: "AI Interaction History" }).click();
    await expect(page.getByText("Showing latest 1 AI interactions")).toBeVisible();
    await expect(page.getByText("summarize")).toBeVisible();
    await expect(page.getByText("Accepted")).toBeVisible();
  });

  test("user can login, generate an AI suggestion, accept it, and undo it", async ({ page }) => {
    await page.route("**/api/auth/login", async (route) => {
      await fulfillJson(route, {
        accessToken: "test-access-token",
        expiresIn: 1800,
        user: { ...memberUser },
      });
    });

    await mockSession(page);
    await mockDocumentsApi(page);
    await mockEditorApi(page);

    await page.goto("/login");
    await page.getByPlaceholder("you@example.com").fill(memberUser.email);
    await page.getByPlaceholder("••••••••").fill("secret123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/documents$/);
    await page.getByRole("button", { name: "Open" }).first().click();
    await expect(page).toHaveURL(/\/documents\/doc-1$/);

    const closeSidePanel = page.getByRole("button", { name: "Close" });
    if (await closeSidePanel.isVisible().catch(() => false)) {
      await closeSidePanel.click();
    }

    await selectEditorText(page, "Quarterly planning draft.");
    await page.getByRole("button", { name: /^AI$/ }).click({ force: true });

    await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.locator("textarea")).toHaveValue("A shorter summary.");

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText(/undo this accepted ai change/i)).toBeVisible();

    await page.getByRole("button", { name: "Undo AI apply" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
  });
});
