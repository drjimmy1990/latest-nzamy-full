import assert from "node:assert/strict";
import test from "node:test";
import { isCloudflareIp, isPrivateOrLoopbackIp, parseIpv4, parseIpv6 } from "./cloudflareIp.ts";

test("parseIpv4 / parseIpv6", () => {
  assert.equal(parseIpv4("1.2.3.4"), 0x01020304);
  assert.equal(parseIpv4("256.1.1.1"), null);
  assert.equal(parseIpv4("1.2.3"), null);
  assert.equal(parseIpv4("1.2.3.4.5"), null);
  assert.equal(parseIpv4("01a.2.3.4"), null);
  assert.equal(parseIpv6("::1"), BigInt(1));
  assert.equal(parseIpv6("::"), BigInt(0));
  assert.equal(parseIpv6("2606:4700::"), BigInt("0x26064700") << BigInt(96));
  assert.equal(parseIpv6("::ffff:1.2.3.4"), (BigInt(0xffff) << BigInt(32)) | BigInt(0x01020304));
  assert.equal(parseIpv6("fe80::1%eth0"), (BigInt(0xfe80) << BigInt(112)) | BigInt(1));
  assert.equal(parseIpv6("1:2:3:4:5:6:7:8"), parseIpv6("1:2:3:4:5:6:7:8"));
  assert.equal(parseIpv6("1:2:3:4:5:6:7"), null);
  assert.equal(parseIpv6("1::2::3"), null);
  assert.equal(parseIpv6("12345::"), null);
  assert.equal(parseIpv6("g::1"), null);
});

test("Cloudflare edge addresses are recognised", () => {
  for (const ip of [
    "172.70.1.1", "172.64.0.0", "172.71.255.255", "162.158.10.20", "104.16.0.1", "104.27.255.255",
    "173.245.48.1", "131.0.75.255", "198.41.200.1",
    "2400:cb00::1", "2606:4700:10::ac43:1", "2a06:98c7:ffff::1", "2c0f:f248::1",
    "::ffff:172.70.1.1", " 172.70.1.1 ",
  ]) assert.equal(isCloudflareIp(ip), true, ip);
});

test("other addresses and junk are not Cloudflare", () => {
  for (const ip of [
    "172.72.0.0", "172.63.255.255", "104.28.0.1", "203.0.113.9", "10.0.0.1", "127.0.0.1",
    "2a06:98c8::1", "2606:4701::1", "2001:db8::1", "::1", "::ffff:203.0.113.9",
    "", "unknown", "not-an-ip", "1.2.3.4, 172.70.1.1", null, undefined,
  ]) assert.equal(isCloudflareIp(ip), false, String(ip));
});

test("loopback and private-network peers", () => {
  for (const ip of [
    "127.0.0.1", "127.8.9.10", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1",
    "100.64.0.1", "::1", "fc00::1", "fd12:3456::1", "fe80::1%eth0", "::ffff:127.0.0.1", "::ffff:10.1.2.3",
  ]) assert.equal(isPrivateOrLoopbackIp(ip), true, ip);
  for (const ip of [
    "172.32.0.1", "172.15.255.255", "8.8.8.8", "172.70.1.1", "203.0.113.9", "2001:db8::1", "2606:4700::1",
    "::ffff:8.8.8.8", "::", "", "unknown", null, undefined,
  ]) assert.equal(isPrivateOrLoopbackIp(ip), false, String(ip));
});
