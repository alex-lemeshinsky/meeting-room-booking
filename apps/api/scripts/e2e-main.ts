import { createE2eApp } from "./e2e-app.js";

const app = await createE2eApp();
await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
