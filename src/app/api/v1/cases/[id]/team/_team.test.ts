import test from "node:test";
import assert from "node:assert/strict";

import { buildCaseTeamDto, isTeamFeatureMissing, noTeamDto, toVia } from "./_team.ts";

const labels: Record<string, string> = { lawyer: "محام", legal_secretary: "سكرتير قانوني", managing_partner: "الشريك المدير" };
const base = {
  firmId: "firm-A",
  callerId: "u-lead",
  teamRows: [
    { user_id: "u-assist", via: "member" },
    { user_id: "u-lead", via: "lead" },
  ],
  memberRows: [
    { user_id: "u-lead", role: "lawyer" },
    { user_id: "u-assist", role: "legal_secretary" },
    { user_id: "u-owner", role: "managing_partner" },
    { user_id: "u-colleague", role: "lawyer" },
  ],
  names: new Map([["u-lead", "ليلى"], ["u-assist", "سارة"], ["u-owner", "عمر"]]),
  roleLabel: (role: string) => labels[role],
};

test("buildCaseTeamDto: the lead sorts first, only an added member is removable, and only by a manager", () => {
  const dto = buildCaseTeamDto({ ...base, canManage: true });
  assert.deepEqual(dto.team.map((p) => [p.userId, p.via, p.removable]), [
    ["u-lead", "lead", false],
    ["u-assist", "member", true],
  ]);
  assert.equal(dto.team[0].isMe, true);
  assert.equal(dto.team[1].roleLabel, "سكرتير قانوني");
  assert.equal(dto.team[0].viaLabel, "المحامي المسؤول عن القضية");

  const notManager = buildCaseTeamDto({ ...base, canManage: false });
  assert.equal(notManager.team.some((p) => p.removable), false);
});

test("buildCaseTeamDto: candidates are active members not on the team, and only for a manager", () => {
  const dto = buildCaseTeamDto({ ...base, canManage: true });
  assert.deepEqual(dto.candidates.map((c) => c.userId).sort(), ["u-colleague", "u-owner"]);
  assert.equal(dto.candidates.find((c) => c.userId === "u-colleague")!.name, null, "no invented name");
  assert.equal(buildCaseTeamDto({ ...base, canManage: false }).candidates.length, 0);
});

test("buildCaseTeamDto: firmMemberCount counts distinct active members", () => {
  assert.equal(buildCaseTeamDto({ ...base, canManage: false }).firmMemberCount, 4);
});

test("buildCaseTeamDto: the team is exactly what SQL returned — nobody is added in TypeScript", () => {
  const dto = buildCaseTeamDto({ ...base, canManage: true, teamRows: [] });
  assert.equal(dto.team.length, 0);
});

test("toVia / noTeamDto / isTeamFeatureMissing", () => {
  assert.equal(toVia("lead"), "lead");
  assert.equal(toVia("filer"), "filer");
  assert.equal(toVia("anything"), "member");
  assert.deepEqual(noTeamDto(), { firmId: null, canManage: false, team: [], candidates: [], firmMemberCount: 0 });
  for (const code of ["PGRST202", "42883", "42P01", "PGRST205"]) assert.equal(isTeamFeatureMissing(code), true);
  assert.equal(isTeamFeatureMissing("42501"), false);
  assert.equal(isTeamFeatureMissing(undefined), false);
});
