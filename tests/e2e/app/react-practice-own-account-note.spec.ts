// Playwright's test tools, with the [RESULT] block printed after every test,
// and the type of a page.
import {
  expect,
  expected,
  fact,
  test,
} from "../../../framework/fixtures/resultBlock";
import type { Page } from "@playwright/test";
// The demo log-ins, signing in, and a fresh customer.
import { DEMO, signIn, signUpCustomer } from "../../../framework/helpers/bank";

// The warning about your own account on the Practice page
// (md/plans/feedback-fixes-plan.md, Part 4; web/src/pages/PracticePage.tsx).
// The demo staff log-ins are public, and staff can see a signed-up customer and
// change their role, status and cards, by design. Instead of changing that,
// every visitor is told, whoever they are signed in as.

// The note's words that matter: who can see it, what they can change, and what
// to type instead of real details.
const NOTE = {
  heading: "Other visitors can see and change your own account.",
  who: "Alex (Admin) and Sam (Support)",
  change: "change your role, lock your account or freeze your cards",
  advice: "Use a made-up name and an email you don't mind others seeing",
  email: "nothing is ever sent to it",
};

// Opens the Practice page and checks the note says all of it.
async function checkNote(page: Page) {
  await test.step("open the Practice page", async () => {
    await page.goto("/app/practice");
  });
  await test.step("read the note about your own account", async () => {
    const note = page.getByTestId("practice-own-account-note");
    await expect(note, "the note is on the page").toBeVisible();
    await expect(
      note,
      "it says other visitors can see and change it",
    ).toContainText(NOTE.heading);
    await expect(note, "it names the demo staff").toContainText(NOTE.who);
    await expect(note, "it says what the Admin can change").toContainText(
      NOTE.change,
    );
    await expect(note, "it says what to type instead").toContainText(
      NOTE.advice,
    );
    await expect(note, "it says no email is ever sent").toContainText(
      NOTE.email,
    );
  });
}

test("the Practice page warns a signed-out visitor that other visitors can see and change their own account", async ({
  page,
}) => {
  expected("signed out: the own-account note, with all five parts");
  fact("signed in as", "nobody");
  await checkNote(page);
});

test("the Practice page shows the own-account warning to someone on a demo account", async ({
  page,
}) => {
  expected("the demo customer: the same note");
  await test.step("sign in as the demo customer", async () => {
    await signIn(page.request, DEMO.customer);
  });
  fact("signed in as", DEMO.customer);
  await checkNote(page);
});

test("the Practice page shows the own-account warning to a customer with their own account", async ({
  page,
}) => {
  expected("a signed-up customer: the same note");
  await test.step("sign up a customer of their own", async () => {
    await signUpCustomer(page.request, "Own Account");
  });
  await checkNote(page);
});
