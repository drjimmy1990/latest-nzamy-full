// Child process used by sdk.test.ts: the SDK-based stdio server against the mock platform.
import { NezamyClient } from "@nezamy/client";
import { runStdioSdk } from "../src/server-sdk.js";
await runStdioSdk(new NezamyClient({ baseUrl: process.env.NEZAMY_BASE_URL!, token: process.env.NEZAMY_TOKEN!, allowInsecureHttp: true }));
