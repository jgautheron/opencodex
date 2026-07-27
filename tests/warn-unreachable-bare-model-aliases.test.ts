import { expect, test } from "bun:test";
import { warnUnreachableBareModelAliases } from "../src/router";
import type { OcxConfig, OcxProviderConfig } from "../src/types";

function configFor(providers: Record<string, OcxProviderConfig>): OcxConfig {
  return { port: 10100, defaultProvider: "openai", providers };
}

function warnCapturing(config: OcxConfig): string[] {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(" ")); };
  try {
    warnUnreachableBareModelAliases(config);
  } finally {
    console.warn = original;
  }
  return warnings;
}

test("warns when another active provider's defaultModel collides with a bare gpt- id, and native openai is configured", () => {
  const warnings = warnCapturing(configFor({
    openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex" } as OcxProviderConfig,
    acmeOpenai: { adapter: "openai-responses", baseUrl: "https://example.internal/openai", defaultModel: "gpt-5.6-sol" } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toContain('provider "acmeOpenai"');
  expect(warnings[0]).toContain('"gpt-5.6-sol"');
  expect(warnings[0]).toContain("acmeOpenai/gpt-5.6-sol");
});

test("warns for every colliding entry in a provider's models[] array", () => {
  const warnings = warnCapturing(configFor({
    openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex" } as OcxProviderConfig,
    cursor: { adapter: "cursor", baseUrl: "https://api2.cursor.sh", models: ["gpt-5.6-sol", "gpt-5.6-terra", "claude-opus-4-8"] } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(2);
  expect(warnings.some(w => w.includes("gpt-5.6-sol"))).toBe(true);
  expect(warnings.some(w => w.includes("gpt-5.6-terra"))).toBe(true);
});

test("does not warn when the colliding model is already qualified with a provider prefix", () => {
  const warnings = warnCapturing(configFor({
    openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex" } as OcxProviderConfig,
    acmeOpenai: { adapter: "openai-responses", baseUrl: "https://example.internal/openai", defaultModel: "acmeOpenai/gpt-5.6-sol" } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("does not warn when no native openai provider is configured at all", () => {
  const warnings = warnCapturing(configFor({
    acmeOpenai: { adapter: "openai-responses", baseUrl: "https://example.internal/openai", defaultModel: "gpt-5.6-sol" } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("does not warn when the native openai provider itself is disabled", () => {
  const warnings = warnCapturing(configFor({
    openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex", disabled: true } as OcxProviderConfig,
    acmeOpenai: { adapter: "openai-responses", baseUrl: "https://example.internal/openai", defaultModel: "gpt-5.6-sol" } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("does not warn about the native openai provider's own defaultModel", () => {
  const warnings = warnCapturing(configFor({
    openai: { adapter: "openai-responses", baseUrl: "https://chatgpt.com/backend-api/codex", defaultModel: "gpt-5.6-sol" } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("warns when a provider's models[] entry collides with the hardcoded prefix-pattern table (claude- -> a literal \"anthropic\" provider)", () => {
  const warnings = warnCapturing(configFor({
    anthropic: { adapter: "anthropic", baseUrl: "https://api.anthropic.com" } as OcxProviderConfig,
    cursor: { adapter: "cursor", baseUrl: "https://api2.cursor.sh", models: ["claude-4-sonnet", "composer-1"] } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(1);
  expect(warnings[0]).toContain('provider "cursor"');
  expect(warnings[0]).toContain('"claude-4-sonnet"');
  expect(warnings[0]).toContain("cursor/claude-4-sonnet");
});

test("does not warn about the pattern table when the pattern's own named provider lists the model itself", () => {
  const warnings = warnCapturing(configFor({
    anthropic: { adapter: "anthropic", baseUrl: "https://api.anthropic.com", models: ["claude-4-sonnet"] } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("does not warn about the pattern table when no provider name matches the pattern's providerNames", () => {
  const warnings = warnCapturing(configFor({
    cursor: { adapter: "cursor", baseUrl: "https://api2.cursor.sh", models: ["claude-4-sonnet"] } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});

test("does not warn about the pattern table when the colliding model is already the pattern-provider's defaultModel", () => {
  const warnings = warnCapturing(configFor({
    anthropic: { adapter: "anthropic", baseUrl: "https://api.anthropic.com", defaultModel: "claude-4-sonnet" } as OcxProviderConfig,
    cursor: { adapter: "cursor", baseUrl: "https://api2.cursor.sh", models: ["claude-4-sonnet"] } as OcxProviderConfig,
  }));
  expect(warnings.length).toBe(0);
});
