import test from "node:test";
import assert from "node:assert/strict";
import { prepareBarcodeBatch } from "../server/domain/barcode-batch.mjs";

test("one barcode batch respects existing cart quantities and reports missing stock", () => {
  const products = [
    { id: "milk", name: "Milk", barcode: "MILK-01", stock: 3 },
    { id: "bread", name: "Bread", barcode: "BREAD-02", stock: 5 },
  ];
  const before = [{ id: "milk", qty: 2 }];
  const batch = prepareBarcodeBatch(["MILK-01", "MILK-01", "BREAD-02", "UNKNOWN"], products, before);
  assert.deepEqual(batch.cart, [{ id: "milk", qty: 3 }, { id: "bread", qty: 1 }]);
  assert.equal(batch.added, 2);
  assert.deepEqual(batch.missing, ["UNKNOWN", "Milk (insufficient stock)"]);
  assert.deepEqual(before, [{ id: "milk", qty: 2 }]);
});
