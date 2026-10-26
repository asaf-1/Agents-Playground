import fs from "node:fs";
import { test as setup } from "@playwright/test";
import {
  ADMIN,
  ADMIN_STATE,
  AUTH_DIR,
  USER,
  USER_STATE,
  signInOrUp,
} from "./_runner";

// One session per role, saved for the specs. Serial, because the order
// matters: the first account created on a fresh runner is the administrator.
setup.describe.configure({ mode: "serial" });

setup("the administrator signs in", async ({ request }) => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await signInOrUp(request, ADMIN);
  await request.storageState({ path: ADMIN_STATE });
});

setup("a plain user signs in", async ({ request }) => {
  await signInOrUp(request, USER);
  await request.storageState({ path: USER_STATE });
});
