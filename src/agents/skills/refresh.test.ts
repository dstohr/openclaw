import type { Stats } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const watchMock = vi.fn(() => ({
  on: vi.fn(),
  close: vi.fn(async () => undefined),
}));

vi.mock("chokidar", () => {
  return {
    default: { watch: watchMock },
  };
});

describe("ensureSkillsWatcher", () => {
  it("ignores node_modules, dist, and .git by default", async () => {
    const mod = await import("./refresh.js");
    mod.ensureSkillsWatcher({ workspaceDir: "/tmp/workspace" });

    expect(watchMock).toHaveBeenCalledTimes(1);
    const opts = watchMock.mock.calls[0]?.[1] as { ignored?: unknown };

    expect(typeof opts.ignored).toBe("function");

    const ignored = opts.ignored as (pathname: string, stats?: Stats) => boolean;
    expect(ignored("/tmp/workspace/skills/node_modules/pkg/index.js")).toBe(true);
    expect(ignored("/tmp/workspace/skills/dist/index.js")).toBe(true);
    expect(ignored("/tmp/workspace/skills/.git/config")).toBe(true);

    expect(ignored("/tmp/workspace/skills/foo/SKILL.md")).toBe(false);
    expect(ignored("/tmp/workspace/skills/foo/_meta.json")).toBe(false);
    expect(
      ignored("/tmp/workspace/skills/foo", { isDirectory: () => true } as unknown as Stats),
    ).toBe(false);
    expect(ignored("/tmp/workspace/skills/foo/readme.md")).toBe(true);

    expect(
      mod.DEFAULT_SKILLS_WATCH_IGNORED.some((re) =>
        re.test("/tmp/workspace/skills/node_modules/pkg/index.js"),
      ),
    ).toBe(true);
    expect(
      mod.DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test("/tmp/workspace/skills/dist/index.js")),
    ).toBe(true);
    expect(
      mod.DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test("/tmp/workspace/skills/.git/config")),
    ).toBe(true);
    expect(
      mod.DEFAULT_SKILLS_WATCH_IGNORED.some((re) => re.test("/tmp/.hidden/skills/index.md")),
    ).toBe(false);
  });
});
