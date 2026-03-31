// apps/ai-service/src/server.ts

import { createApp } from "./app";
import { config } from "./config/env";

const app = createApp();

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `AI Service running on port ${config.PORT} (${config.NODE_ENV})`
  );

  // eslint-disable-next-line no-console
  console.log(`LLM Provider: ${config.LLM_PROVIDER}`);

  if (config.LLM_PROVIDER === "lmstudio") {
    // eslint-disable-next-line no-console
    console.log(`LM Studio URL: ${config.LLM_BASE_URL}`);
    // eslint-disable-next-line no-console
    console.log(`Model: ${config.LLM_MODEL ?? "default (auto)"}`);
  }
});