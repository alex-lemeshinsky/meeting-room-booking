import { createApp } from "./bootstrap.js";

const app = await createApp();
await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
