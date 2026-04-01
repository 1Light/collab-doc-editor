// apps/api/src/server.ts

import { createApp } from "./app";
import { config } from "./config/env";
import { startRetentionCron } from "./jobs/retentionCron";

const app = createApp();

// Start scheduled background jobs
startRetentionCron();

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server running on port ${config.PORT} (${config.NODE_ENV})`);
});