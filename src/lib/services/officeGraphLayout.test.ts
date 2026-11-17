import test from "node:test";
import assert from "node:assert/strict";
import { buildOfficeGraph, type OfficeCaseInput } from "./officeGraph.ts";
import { layeredLayout, OFFICE_NODE_W, officeNodeHeight } from "./officeGraphLayout.ts";

const kase = (id: string, o: Partial<OfficeCaseInput> = {}): OfficeCaseInput => ({
  id, title: `قضية ${id}`, status: "assigned", lawyerClientId: null, requester: { name: "" }, metadata: {}, ...o,
});

const sample = () =>
  buildOfficeGraph(
    [
      kase("a", { lawyerClientId: "c1", requester: { name: "مؤسسة النور" }, metadata: { opponentName: "شركة الريان" } }),
      kase("b", { lawyerClientId: "c2", requester: { name: "خالد" } }),
      kase("c", { lawyerClientId: "c1", requester: { name: "مؤسسة النور" } }),
    ],
    [
      { id: "c1", name: "مؤسسة النور", clientType: "company" },
      { id: "c2", name: "خالد", clientType: "individual" },
      { id: "c3", name: "موكّل بلا قضايا", clientType: "individual" },
    ],
    {
      tasks: [
        { id: "t1", caseId: "a", title: "مهمة ١", status: "todo", priority: "normal", dueDate: null },
        { id: "t2", caseId: "a", title: "مهمة ٢", status: "todo", priority: "normal", dueDate: null },
      ],
      contracts: [{ id: "k1", title: "عقد", status: "active", contractType: "other", lawyerClientId: "c1", clientUserId: null, requestId: null, counterpartyName: null, valueSar: null, endsOn: null }],
    },
  );

test("every node is placed, deterministically", () => {
  const g = sample();
  const a = layeredLayout(g);
  assert.equal(a.size, g.nodes.length);
  assert.deepEqual([...layeredLayout(g).entries()], [...a.entries()], "same data, same picture");
  assert.equal(layeredLayout({ nodes: [], edges: [] }).size, 0);
});

test("columns read right to left: clients, contracts, cases, opponents, then the case's own tasks", () => {
  const g = sample();
  const p = layeredLayout(g);
  const x = (id: string) => p.get(id)!.x;
  assert.ok(x("client:c1") > x("contract:k1"));
  assert.ok(x("contract:k1") > x("case:a"));
  assert.ok(x("case:a") > x("opponent:شركه الريان"));
  assert.ok(x("opponent:شركه الريان") > x("task:t1"));
});

test("no two cards in one column overlap, and a case's tasks sit level with it", () => {
  const g = sample();
  const p = layeredLayout(g);
  const byX = new Map<number, Array<{ y: number; h: number }>>();
  for (const n of g.nodes) {
    const pos = p.get(n.id)!;
    byX.set(pos.x, [...(byX.get(pos.x) ?? []), { y: pos.y, h: officeNodeHeight(n) }]);
  }
  for (const list of byX.values()) {
    list.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].y >= list[i - 1].y + list[i - 1].h, "overlap");
  }
  const caseA = p.get("case:a")!;
  const t1 = p.get("task:t1")!;
  const t2 = p.get("task:t2")!;
  const centreA = caseA.y + officeNodeHeight(g.nodes.find((n) => n.id === "case:a")!) / 2;
  assert.ok(t1.y <= centreA && centreA <= t2.y + 100, "the stack straddles its case");
  assert.ok(new Set([...p.values()].map((q) => q.x)).size <= 5);
  assert.ok([...p.values()].every((q) => q.x % (OFFICE_NODE_W + 120) === 0));
});

test("a client's cases are next to each other (barycentre ordering)", () => {
  const g = sample();
  const p = layeredLayout(g);
  const order = ["case:a", "case:b", "case:c"].sort((m, n) => p.get(m)!.y - p.get(n)!.y);
  assert.ok(Math.abs(order.indexOf("case:a") - order.indexOf("case:c")) === 1, order.join(","));
});
