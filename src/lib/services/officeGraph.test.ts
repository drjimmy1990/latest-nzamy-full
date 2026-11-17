import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficeGraph, isCaseRow, officeCaseOrFilter, officeOwnRowsFilter, type OfficeCaseInput } from "./officeGraph.ts";

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

// ── N07-49: one client, one node ─────────────────────────────────────────

test("N07-49: a platform case by the account a card is linked to joins that card — one node, both links", () => {
  const g = buildOfficeGraph(
    [
      kase("own", { lawyerClientId: "c1", requester: { name: "سارة العتيبي" } }),
      kase("web", { requesterUserId: "acct-1", requester: { name: "ساره العتيبى" } }),
    ],
    [{ id: "c1", name: "سارة العتيبي", clientType: "individual", clientUserId: "acct-1" }],
  );
  const clients = g.nodes.filter((n) => n.kind === "client");
  assert.deepEqual(clients.map((n) => n.id), ["client:c1"], "no floating duplicate");
  assert.equal(clients[0].caseCount, 2);
  assert.match(clients[0].facts!.find((f) => f.label === "المصدر")!.value, /بطاقة موكّل \+ حساب على المنصة/);
  assert.ok(!JSON.stringify(g).includes("acct-1"), "the account id never leaves the server");
});

test("N07-49: a case naming no card merges into the ONE card with that normalised name", () => {
  const g = buildOfficeGraph(
    [kase("a", { requester: { name: "شركة الأفق" } })],
    [{ id: "c1", name: "شركة الافق", clientType: "company" }],
  );
  assert.deepEqual(g.nodes.filter((n) => n.kind === "client").map((n) => n.id), ["client:c1"]);
  assert.deepEqual(g.edges, [{ from: "case:a", to: "client:c1", relation: "client" }]);
});

test("N07-49: two cards with the same name are not guessed between", () => {
  const g = buildOfficeGraph(
    [kase("a", { requester: { name: "محمد" } })],
    [{ id: "c1", name: "محمد", clientType: "individual" }, { id: "c2", name: "محمد", clientType: "individual" }],
  );
  const target = g.edges.find((e) => e.from === "case:a")!.to;
  assert.equal(target, "client:name:محمد");
});

test("N07-49: an account with no card is one node across its cases, and a name-only mention joins it", () => {
  const g = buildOfficeGraph(
    [
      kase("x", { requester: { name: "خالد" }, metadata: { intake: { parties: { one: { fullName: "خالد" } } } } }),
      kase("w1", { requesterUserId: "acct-9", requester: { name: "خالد" } }),
      kase("w2", { requesterUserId: "acct-9", requester: { name: "خالد" } }),
    ],
    [],
  );
  const clients = g.nodes.filter((n) => n.kind === "client");
  assert.equal(clients.length, 1);
  assert.equal(clients[0].caseCount, 3);
});

test("an opponent is never folded into a client card of the same name", () => {
  const g = buildOfficeGraph(
    [kase("b", { metadata: { opponentName: "شركة الأفق" } })],
    [{ id: "c9", name: "شركة الأفق", clientType: "company" }],
  );
  assert.ok(g.nodes.some((n) => n.id === "opponent:شركه الافق"));
  assert.equal(g.clashes.length, 1);
});

// ── N07-50..52: the office's other records ────────────────────────────────

test("contracts, consultations, hearings, tasks and fees hang on what is drawn — nothing else", () => {
  const g = buildOfficeGraph(
    [kase("a", { lawyerClientId: "c1", requester: { name: "مؤسسة النور" }, metadata: { court: "المحكمة العامة بالرياض" } })],
    [{ id: "c1", name: "مؤسسة النور", clientType: "company", feeTotalSar: 10000, feePaidSar: 2500 }],
    {
      contracts: [
        { id: "k1", title: "عقد أتعاب", status: "active", contractType: "fee_agreement", lawyerClientId: "c1", clientUserId: null, requestId: "a", counterpartyName: null, valueSar: 5000, endsOn: "2027-01-31" },
        { id: "k2", title: "عقد يتيم", status: "draft", contractType: "other", lawyerClientId: null, clientUserId: null, requestId: "not-drawn", counterpartyName: null, valueSar: null, endsOn: null },
      ],
      consultations: [
        { id: "s1", status: "completed", mode: "video", specialty: "تجاري", scheduledAt: "2026-11-01T10:00:00Z", lawyerClientId: "c1", requesterUserId: null, convertedCaseId: null, feeSar: null, feePaid: false },
      ],
      hearings: [
        { id: "h2", caseId: "a", title: "جلسة ثانية", kind: "judicial", date: "2026-12-10", time: null, courtName: "" },
        { id: "h1", caseId: "a", title: "جلسة أولى", kind: "judicial", date: "2026-11-20", time: "09:30:00", courtName: "المحكمة التجارية" },
        { id: "hx", caseId: "restricted", title: "لا تظهر", kind: "judicial", date: "2026-11-21", time: null, courtName: "" },
      ],
      tasks: [{ id: "t1", caseId: "a", title: "إعداد مذكرة", status: "todo", priority: "high", dueDate: "2026-11-19" }],
      invoices: [
        { id: "p1", caseId: "a", lawyerClientId: null, amount: 3000, paid: 3000 },
        { id: "p2", caseId: "a", lawyerClientId: null, amount: 2000, paid: 500 },
        { id: "p3", caseId: null, lawyerClientId: "c1", amount: 700, paid: 0 },
      ],
    },
  );
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const id of ["contract:k1", "consultation:s1", "hearing:h1", "hearing:h2", "task:t1", "fee:case:a", "fee:client:c1"]) assert.ok(ids.has(id), id);
  assert.ok(!ids.has("contract:k2"), "a contract on nothing drawn is not drawn");
  assert.ok(!ids.has("hearing:hx"), "a hearing of a case not on the map is not drawn");
  assert.ok(!JSON.stringify(g).includes("لا تظهر"));
  assert.deepEqual(g.unlinked, { contracts: 1, consultations: 0 });

  const fee = g.nodes.find((n) => n.id === "fee:case:a")!;
  assert.equal(fee.facts!.find((f) => f.label === "الفواتير")!.value, "٢");
  assert.match(fee.facts!.find((f) => f.label === "المتبقي")!.value, /١[٬,]?٥٠٠/);
  const kaseNode = g.nodes.find((n) => n.id === "case:a")!;
  assert.equal(kaseNode.facts!.find((f) => f.label === "الجلسة القادمة")!.value, "٢٠/١١/٢٠٢٦ — ٠٩:٣٠", "the soonest one");
  assert.equal(kaseNode.facts!.find((f) => f.label === "المحكمة")!.value, "المحكمة العامة بالرياض");
  assert.equal(kaseNode.link?.kind, "case");
  assert.deepEqual(g.nodes.find((n) => n.id === "contract:k1")!.link, { kind: "contract", id: "k1" });
  assert.ok(g.edges.some((e) => e.from === "client:c1" && e.to === "contract:k1"));
  assert.ok(g.edges.some((e) => e.from === "case:a" && e.to === "contract:k1"));
  const card = g.nodes.find((n) => n.id === "client:c1")!;
  assert.ok(card.facts!.some((f) => f.label === "الأتعاب المتفق عليها"));
  assert.equal(card.caseCount, 1, "satellite edges are not cases");
});

test("no invoice read, no fee node — never a «٠» guessed for an unbilled case", () => {
  const g = buildOfficeGraph([kase("a")], [], { invoices: [] });
  assert.ok(!g.nodes.some((n) => n.kind === "fee"));
});

test("a fee hidden from the caller is not drawn as a value", () => {
  const g = buildOfficeGraph([], [{ id: "c1", name: "موكّل", clientType: "individual", feeTotalSar: null, feePaidSar: null }]);
  assert.ok(!g.nodes[0].facts!.some((f) => f.label.includes("الأتعاب")));
});

test("officeOwnRowsFilter: own rows and own firms only", () => {
  const uid = "11111111-0000-0000-0000-000000000001";
  const f1 = "ffffffff-0000-0000-0000-0000000000f1";
  assert.equal(officeOwnRowsFilter("lawyer_user_id", uid, [f1, "bad)"]), `lawyer_user_id.eq.${uid},firm_id.in.(${f1})`);
  assert.equal(officeOwnRowsFilter("owner_user_id", uid, []), `owner_user_id.eq.${uid}`);
});
