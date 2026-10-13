import { describe, expect, it } from "vitest";

import { returnTo } from "./return-to";

// The one destination a sign-in may return to other than home (ADR-0013), as a table: an
// authorization request on this host is honoured, and everything else lands on `/`.
describe("where a sign-in returns to", () => {
  it.each([
    "/oauth/authorize?response_type=code&client_id=cli_abc&state=xyz",
    "/oauth/authorize?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector_platform_oauth_redirect",
  ])("honours the authorization request %s", (next) => {
    expect(returnTo(next)).toBe(next);
  });

  it.each([
    ["nothing", undefined],
    ["not a string", ["/oauth/authorize?x=1"]],
    ["home", "/"],
    ["another page", "/settings"],
    ["the path with no query", "/oauth/authorize"],
    ["a path only starting like it", "/oauth/authorized?x=1"],
    ["a path under it", "/oauth/authorize/../settings?x=1"],
    ["another host", "https://evil.example/oauth/authorize?x=1"],
    ["a protocol-relative address", "//evil.example/oauth/authorize?x=1"],
    ["a backslash", "/\\evil.example/oauth/authorize?x=1"],
    ["a javascript: address", "javascript:alert(1)//oauth/authorize?"],
    ["a header split", "/oauth/authorize?x=1\r\nSet-Cookie: a=b"],
    ["a backslash later on", "/oauth/authorize?x=\\\\evil"],
    ["something too long", `/oauth/authorize?${"a".repeat(5000)}`],
  ])("sends %s home", (_, next) => {
    expect(returnTo(next)).toBe("/");
  });
});
