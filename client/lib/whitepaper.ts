import fs from "node:fs"
import path from "node:path"

/**
 * Resolves whitepaper from bundled copy first, then monorepo root (local dev / full repo deploy).
 */
export function readWhitepaperMarkdown(): string {
  const repoRoot = path.join(/* turbopackIgnore: true */ process.cwd(), "..", "whitepaper.md")
  if (fs.existsSync(repoRoot)) {
    return fs.readFileSync(repoRoot, "utf8")
  }
  const bundled = path.join(process.cwd(), "content", "whitepaper.md")
  if (fs.existsSync(bundled)) {
    return fs.readFileSync(bundled, "utf8")
  }
  throw new Error("whitepaper.md not found (../whitepaper.md or content/whitepaper.md)")
}
