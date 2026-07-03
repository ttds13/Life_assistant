import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const configFile = fileURLToPath(new URL("../vite.config.ts", import.meta.url));

const server = await createServer({
  configFile,
  mode: "development",
  server: {
    host: "0.0.0.0",
  },
});

await server.listen();
server.printUrls();

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
