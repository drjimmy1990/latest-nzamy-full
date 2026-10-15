import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRoomError, parseCreateRoomBody, withRelatedId } from "./_createRoom.ts";

const A = "11111111-0000-0000-0000-00000000000a";
const C = "22222222-0000-0000-0000-00000000000c";

test("the client's own body (type + related_id) is accepted", () => {
  const r = parseCreateRoomBody({ participant_ids: [C, A], type: "direct", related_id: "req-1", name: "استشارة req-1" });
  assert.deepEqual(r, { ok: true, value: { requestId: "req-1", participantIds: [C, A], name: "استشارة req-1", roomType: "direct" } });
});

test("the older spelling (room_type + request_id) is accepted too, and type defaults to direct", () => {
  const r = parseCreateRoomBody({ participant_ids: [A], room_type: "group", request_id: " req-2 " });
  assert.ok(r.ok);
  assert.equal(r.value.roomType, "group");
  assert.equal(r.value.requestId, "req-2");
  const d = parseCreateRoomBody({ participant_ids: [A], related_id: "req-3" });
  assert.ok(d.ok && d.value.roomType === "direct");
});

test("a room needs a service request", () => {
  for (const body of [{ participant_ids: [A] }, { participant_ids: [A], related_id: "" }, { participant_ids: [A], related_id: 7 }]) {
    const r = parseCreateRoomBody(body);
    assert.equal(r.ok, false, JSON.stringify(body));
  }
});

test("platform room types, bad ids and oversized lists are refused", () => {
  assert.equal(parseCreateRoomBody({ participant_ids: [A], related_id: "r", type: "case" }).ok, false);
  assert.equal(parseCreateRoomBody({ participant_ids: [A], related_id: "r", room_type: "support" }).ok, false);
  assert.equal(parseCreateRoomBody({ participant_ids: ["not-a-uuid"], related_id: "r" }).ok, false);
  assert.equal(parseCreateRoomBody({ participant_ids: [], related_id: "r" }).ok, false);
  assert.equal(parseCreateRoomBody({ participant_ids: Array(21).fill(A), related_id: "r" }).ok, false);
  assert.equal(parseCreateRoomBody(null).ok, false);
  assert.equal(parseCreateRoomBody([A]).ok, false);
});

test("duplicate ids collapse; the name is trimmed and capped", () => {
  const r = parseCreateRoomBody({ participant_ids: [A, A.toUpperCase()], related_id: "r", name: `  ${"م".repeat(300)}  ` });
  assert.ok(r.ok);
  assert.deepEqual(r.value.participantIds, [A]);
  assert.equal(r.value.name.length, 200);
});

test("create_chat_room errors map to 403 / 400 / 500 in Arabic", () => {
  assert.equal(createRoomError("42501").status, 403);
  assert.equal(createRoomError("22023").status, 400);
  assert.equal(createRoomError("PGRST202").status, 500);
  assert.equal(createRoomError(undefined).status, 500);
  for (const c of ["42501", "22023", undefined]) assert.match(createRoomError(c).error, /[؀-ۿ]/);
});

test("related_id comes from request_id, then case_id", () => {
  assert.equal(withRelatedId({ id: "x", request_id: "req-1", case_id: "case-1" }).related_id, "req-1");
  assert.equal(withRelatedId({ id: "x", request_id: null, case_id: "case-1" }).related_id, "case-1");
  assert.equal(withRelatedId({ id: "x", request_id: null, case_id: null }).related_id, null);
});

test("the route creates rooms only through create_chat_room and returns related_id", () => {
  const src = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(src, /\.rpc\("create_chat_room", \{/);
  assert.doesNotMatch(src, /\.from\("chat_rooms"\)\s*\.insert\(/);
  assert.doesNotMatch(src, /\.from\("chat_participants"\)\s*\.insert\(/);
  assert.match(src, /roomsWithLastMessage = await Promise\.all\(/);
  assert.match(src, /return \{ \.\.\.withRelatedId\(room\), last_message: lastMessage \};/);
  assert.match(src, /NextResponse\.json\(\{ data: withRelatedId\(room\) \}, \{ status: 201 \}\)/);
});
