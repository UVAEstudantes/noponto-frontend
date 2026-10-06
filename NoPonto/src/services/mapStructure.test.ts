import assert from "node:assert/strict";
import test from "node:test";
import { assinaturaEstruturalParadas } from "./mapStructure";

test("stop toggle and async stop hydration produce distinct structural signatures", () => {
  const off = assinaturaEstruturalParadas(false, []);
  const loading = assinaturaEstruturalParadas(true, []);
  const loaded = assinaturaEstruturalParadas(true, [{ paradaId: "A" }, { paradaId: "B" }]);
  assert.notEqual(off, loading);
  assert.notEqual(loading, loaded);
  assert.equal(assinaturaEstruturalParadas(false, [{ paradaId: "A" }]), off);
});
