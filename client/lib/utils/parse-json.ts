import { ALL, parseJSON } from "partial-json"

/**
 * Resilient LLM-output → JSON parser.
 *
 * Handles the usual ways a small model wraps its output:
 *   * surrounding prose ("Here is the decision: { ... }")
 *   * ```json fences with or without language tag
 *   * trailing commentary
 *   * truncated JSON (via partial-json)
 *
 * Returns `{}` if no recoverable object/array is found. Callers should still
 * pass the result through a schema validator (zod) before trusting it.
 */
export function parseUntilJson(jsonstr: string): Record<string, unknown> {
  let jsonRes: string | unknown = jsonstr
  if (typeof jsonRes !== "string") return {}

  jsonRes = jsonRes.replaceAll("\n", "")
  if ((jsonRes as string).startsWith("```json")) {
    jsonRes = (jsonRes as string).replace("```json", "")
  }
  if ((jsonRes as string).startsWith("`") || (jsonRes as string).endsWith("`")) {
    jsonRes = (jsonRes as string).replaceAll("```", "")
  }

  try {
    const properlyParsedJson = JSON.parse(jsonRes as string)
    if (typeof properlyParsedJson === "object" && properlyParsedJson !== null) {
      return properlyParsedJson as Record<string, unknown>
    } else {
      jsonRes = properlyParsedJson
    }
  } catch {
    // fall through to the salvage path
  }

  if (typeof jsonRes !== "string") return {}

  const curlIndex = jsonRes.indexOf("{") === -1 ? jsonRes.length : jsonRes.indexOf("{")
  const sqIndex = jsonRes.indexOf("[") === -1 ? jsonRes.length : jsonRes.indexOf("[")
  jsonRes = jsonRes.slice(Math.min(curlIndex, sqIndex))

  if ((jsonRes as string).startsWith("```json")) {
    jsonRes = (jsonRes as string).replace("```json", "")
  }
  if ((jsonRes as string).startsWith("`") || (jsonRes as string).endsWith("`")) {
    jsonRes = (jsonRes as string).replaceAll("```", "")
  }
  jsonRes = (jsonRes as string).replaceAll("{\\n", "{").replaceAll("\\n}", "}")

  try {
    let guard = 0
    while (typeof jsonRes === "string" && guard < 4) {
      jsonRes = parseJSON(jsonRes as string, ALL)
      guard += 1
    }
    if (typeof jsonRes === "object" && jsonRes !== null) {
      return jsonRes as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}
