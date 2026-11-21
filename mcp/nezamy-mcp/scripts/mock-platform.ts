/**
 * Fake Nezamy platform for LOCAL testing only (synthetic data, no network, no Supabase, no real token).
 *   npm run mock            -> http://127.0.0.1:8799   (PORT to change)
 * Tokens that this fake accepts (made up, mean nothing anywhere else):
 *   normal lawyer: nzy_pat_test_token_0123456789      staff: nzy_pat_staff_token_0123456789
 */
import { startMock, GOOD_TOKEN, STAFF_TOKEN } from "../../nezamy-client/test/mock-server.js";

const port = Number(process.env.PORT ?? 8799);
const mock = await startMock({ pollsBeforeDone: 2, port });
console.error(`mock platform on ${mock.url}`);
console.error(`  lawyer token: ${GOOD_TOKEN}`);
console.error(`  staff  token: ${STAFF_TOKEN}   (needed for run_sayegh / read_case_dossier / add_to_research_pool)`);
console.error("Ctrl+C to stop.");
process.on("SIGINT", () => { void mock.close().then(() => process.exit(0)); });
await new Promise(() => {});
