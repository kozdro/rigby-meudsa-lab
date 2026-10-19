import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

export const root = fileURLToPath(new URL("../", import.meta.url))

// Read only the requested Codex RPC result; never log credential-bearing config.
export function codexRead(method, params) {
  return new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--stdio"], {
      cwd: root, stdio: ["pipe", "pipe", "pipe"],
    })
    let settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill()
      if (error) reject(error)
      else resolve(result)
    }
    const timer = setTimeout(() => finish(new Error("Codex RPC timed out")), 15000)
    child.stderr.resume()
    child.on("error", finish)
    child.stdin.on("error", (error) => finish(error))
    child.on("exit", (code) => {
      if (!settled) finish(new Error(`Codex exited before RPC response (exit ${code})`))
    })
    const send = (id, name, args) =>
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: name, params: args }) + "\n")
    createInterface({ input: child.stdout }).on("line", (line) => {
      let event
      try { event = JSON.parse(line) } catch { return }
      if (event.error) return finish(new Error(`Codex RPC error ${event.error.code}`))
      if (event.id === 1) {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n")
        send(2, method, params)
      }
      if (event.id === 2) finish(null, event.result)
    })
    send(1, "initialize", {
      clientInfo: { name: "rigby-harness", version: "1.0.0" },
      capabilities: { experimentalApi: true },
    })
  })
}
