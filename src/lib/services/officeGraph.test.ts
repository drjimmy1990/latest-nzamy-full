import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficeGraph, isCaseRow, officeCaseOrFilter, type OfficeCaseInput } from "./officeGraph.ts";

const kase = (id: string, o: Partial<OfficeCaseInput> = {}): OfficeCaseInput => ({
  id, title: `قضية ${id}`, status: "assigned", lawyerClientId: null, requester: { name: "" }, metadata: {}, ...o,
});

test("isCaseRow keeps cases and drops the other writers of service_requests", () => {
  assert.equal(isCaseRow("service", { court: "x" }), true);
  assert.equal(isCaseRow("service", null), true);
  assert.equal(isCaseRow("consultation", {}), false);
  assert.equal(isCaseRow("service", { task: true }), false);
  assert.equal(isCaseRow("service", { client: true }), false);
  assert.equal(isCaseRow("service", { invoice: true }), false);
  assert.equal(isCaseRow("service", { caseName: "", time: "10:00" }), false);
});

test("a client card on two cases is one shared node with two edges", () => {
  const g = buildOfficeGraph(
    [
      kase("a", { lawyerClientId: "c1", requester: { name: "شركة الأفق" } }),
      kase("b", { lawyerClientId: "c1", requester: { name: "شركة الأفق" } }),
    ],
    [{ id: "c1", name: "شركة الأفق", clientType: "company" }, { id: "c2", name: "محمد", clientType: "individual" }],
  );
  const card = g.nodes.find((n) => n.id === "client:c1");
  assert.equal(card?.caseCount, 2);
  assert.deepEqual(g.edges.filter((e) => e.to === "client:c1").map((e) => e.from).sort(), ["case:a", "case:b"]);
  assert.equal(g.nodes.find((n) => n.id === "client:c2")?.caseCount, 0, "a card with no case is still on the map");
  assert.equal(g.clashes.length, 0);
});

test("the same name as client on one case and opponent on another is a «تشابه اسم» hint", () => {
  const g = buildOfficeGraph(
    [
      kase("a", { lawyerClientId: "c1", requester: { name: "مؤسسة النور" } }),
      kase("b", { requester: { name: "خالد" }, metadata: { intake: { parties: { one: { fullName: "خالد" }, two: { companyName: "مؤسسه النور", commercialReg: "1010" } } } } }),
    ],
    [{ id: "c1", name: "مؤسسة النور", clientType: "company" }],
  );
  assert.equal(g.clashes.length, 1);
  assert.deepEqual(g.clashes[0].clientIn, ["a"]);
  assert.deepEqual(g.clashes[0].opponentIn, ["b"]);
  assert.deepEqual(g.clashes[0].clientCardIds, ["c1"]);
  const sameName = g.edges.filter((e) => e.relation === "same_name");
  assert.equal(sameName.length, 1);
  assert.ok(g.nodes.filter((n) => n.nameClash).length >= 2);
  assert.ok(!JSON.stringify(g).includes("1010"), "no register number leaves the server");
});

test("a card whose name is an opponent elsewhere clashes even with no case of its own", () => {
  const g = buildOfficeGraph(
    [kase("b", { metadata: { intake: { otherParty: "شركة الأفق" } } })],
    [{ id: "c9", name: "شركة الافق", clientType: "company" }],
  );
  assert.equal(g.clashes.length, 1);
  assert.deepEqual(g.clashes[0].clientCardIds, ["c9"]);
});

test("nothing recorded, nothing drawn: a case without parties is a lone node, no opponent invented", () => {
  const g = buildOfficeGraph([kase("x")], []);
  assert.deepEqual(g.nodes.map((n) => n.kind), ["case"]);
  assert.equal(g.edges.length, 0);
  assert.equal(g.nodes[0].label, "قضية x");
  assert.equal(buildOfficeGraph([kase("y", { title: "  " })], []).nodes[0].label, "قضية بلا عنوان");
});

test("officeCaseOrFilter: own rows and own firms only — never the open marketplace", () => {
  const uid = "11111111-0000-0000-0000-000000000001";
  const f1 = "ffffffff-0000-0000-0000-0000000000f1";
  assert.equal(officeCaseOrFilter(uid, []), `requester_user_id.eq.${uid},assigned_to.eq.${uid}`);
  assert.equal(
    officeCaseOrFilter(uid, [f1, f1, "x),or(id.neq.0"]),
    `requester_user_id.eq.${uid},assigned_to.eq.${uid},firm_id.in.(${f1})`,
    "duplicates folded, anything that is not a uuid dropped",
  );
});
