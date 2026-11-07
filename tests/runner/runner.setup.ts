// Node's file tools.
import fs from "node:fs";
// Playwright's test tools as `setup`, with the [RESULT] block printed after each.
import { expected, test as setup } from "../../framework/fixtures/resultBlock";
// The two accounts, where their sessions are saved, and sign-in-or-up.
import {
  ADMIN,
  ADMIN_STATE,
  AUTH_DIR,
  USER,
  USER_STATE,
  signInOrUp,
} from "../../framework/helpers/runner";

// One session per role, saved for the specs. Serial, because the order
// matters: the first account created on a fresh runner is the administrator.
setup.describe.configure({ mode: "serial" });

// The administrator first, so on a fresh runner it becomes the admin.
setup("the administrator signs in", async ({ request }) => {
  expected("runner-admin signed in (or signed up) and its session saved");
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await signInOrUp(request, ADMIN);
  await request.storageState({ path: ADMIN_STATE });
});

// Then the plain user.
setup("a plain user signs in", async ({ request }) => {
  expected("runner-user signed in (or signed up) and its session saved");
  await signInOrUp(request, USER);
  await request.storageState({ path: USER_STATE });
});
