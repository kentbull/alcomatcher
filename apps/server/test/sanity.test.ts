import { test } from "node:test";
import assert from "node:assert/strict";
import { labelApplicationStatusColor } from "../src/types/compliance.js";

test("labelApplicationStatusColor returns green for matched", () => {
  assert.equal(labelApplicationStatusColor("matched"), "green");
});

test("labelApplicationStatusColor returns green for approved", () => {
  assert.equal(labelApplicationStatusColor("approved"), "green");
});

test("labelApplicationStatusColor returns red for rejected", () => {
  assert.equal(labelApplicationStatusColor("rejected"), "red");
});

test("labelApplicationStatusColor returns amber for pending", () => {
  assert.equal(labelApplicationStatusColor("pending"), "amber");
});

test("labelApplicationStatusColor returns amber for in_progress", () => {
  assert.equal(labelApplicationStatusColor("in_progress"), "amber");
});
