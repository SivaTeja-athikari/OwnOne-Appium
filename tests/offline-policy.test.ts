import { it } from "node:test";
import assert from "node:assert";
import {
  OFFLINE_OPERATION_POLICY,
  offlineOperationMessage,
} from "../src/core/offline/operation-policy";

it("keeps authentication server-only and signup drafts local-only", () => {
  assert.strictEqual(OFFLINE_OPERATION_POLICY.signIn.offline, "blocked");
  assert.strictEqual(OFFLINE_OPERATION_POLICY.signIn.replay, "never");
  assert.strictEqual(OFFLINE_OPERATION_POLICY.signUp.offline, "save-draft-only");
  assert.strictEqual(OFFLINE_OPERATION_POLICY.signUp.replay, "never");
  assert.strictEqual(/not available offline/i.test(offlineOperationMessage("signIn")), true);
  assert.strictEqual(/draft on this device/i.test(offlineOperationMessage("signUp")), true);
});

it("does not represent unsupported CRUD or file workflows as queued", () => {
  for (const operation of [
    "transactionCreate",
    "reportExport",
    "fileUpload",
    "fileDownload",
  ] as const) {
    assert.strictEqual(OFFLINE_OPERATION_POLICY[operation].offline, "not-implemented");
    assert.strictEqual(OFFLINE_OPERATION_POLICY[operation].replay, "not-implemented");
  }
});
