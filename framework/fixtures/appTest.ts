// Playwright's tool for joining two sets of fixtures into one test.
import { mergeTests } from "@playwright/test";
// The framework's page fixtures: homePage, loginPage, userManagerPage and the rest.
import { test as appTest } from "./baseTest";
// The [RESULT] block, printed after every test.
import { test as resultTest } from "./resultBlock";

// One test with both: the framework's page objects and the [RESULT] block. The
// specs that use page objects import `test` from here instead of from
// framework/fixtures/baseTest, so the framework itself does not change.
export const test = mergeTests(appTest, resultTest);

// expect, and the two calls a test uses to fill its block.
export { expect, expected, fact } from "./resultBlock";
