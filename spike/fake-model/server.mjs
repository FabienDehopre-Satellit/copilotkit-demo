// PROTOTYPE — throwaway. A fake OpenAI *Responses* API that scripts the
// beat-6 two-tool-call turn and logs every request body it receives.
// Answers issue #14: what does the second call see?
import http from "node:http";
import fs from "node:fs";

const LOG = new URL("./requests.jsonl", import.meta.url);
fs.writeFileSync(LOG, "");

let call = 0;

const sse = (res, obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

const created = (res) =>
  sse(res, {
    type: "response.created",
    response: { id: "resp_fake", created_at: Math.floor(Date.now() / 1000), model: "fake" },
  });

const completed = (res) =>
  sse(res, {
    type: "response.completed",
    response: { usage: { input_tokens: 0, output_tokens: 0 } },
  });

function functionCall(res, { name, args, callId }) {
  const item = { type: "function_call", id: `fc_${callId}`, call_id: callId, name, arguments: "" };
  sse(res, { type: "response.output_item.added", output_index: 0, item });
  sse(res, {
    type: "response.function_call_arguments.delta",
    item_id: item.id,
    output_index: 0,
    delta: args,
  });
  sse(res, {
    type: "response.function_call_arguments.done",
    item_id: item.id,
    output_index: 0,
    arguments: args,
  });
  sse(res, {
    type: "response.output_item.done",
    output_index: 0,
    item: { ...item, arguments: args, status: "completed" },
  });
}

function text(res, body) {
  const item = { type: "message", id: "msg_fake" };
  sse(res, { type: "response.output_item.added", output_index: 0, item });
  sse(res, { type: "response.output_text.delta", item_id: item.id, delta: body });
  sse(res, { type: "response.output_item.done", output_index: 0, item: { type: "message", id: item.id } });
}

// The script. One entry per model call the runtime makes, in order.
// Mirrors beat 6: MCP lookup, then the frontend assign, then a summary.
const script = [
  (res) => functionCall(res, { name: "find_teammates", args: JSON.stringify({ skill: "data" }), callId: "call_find" }),
  (res) => functionCall(res, { name: "assignTask", args: JSON.stringify({ id: "T-2", assignee: "Ines" }), callId: "call_assign" }),
  (res) => text(res, "STEP3-SUMMARY"),
  (res) => text(res, "STEP4-OVERFLOW"),
];

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const n = call++;
      const body = JSON.parse(raw || "{}");
      // What the model actually sees, per call.
      const system = (body.input ?? []).filter((m) => m.role === "system" || m.role === "developer");
      fs.appendFileSync(
        LOG,
        JSON.stringify({
          call: n,
          at: new Date().toISOString(),
          path: req.url,
          systemText: JSON.stringify(system),
          input: body.input,
          tools: (body.tools ?? []).map((t) => t.name),
        }) + "\n",
      );
      console.log(`[fake-model] call ${n} — ${(body.input ?? []).length} input items`);

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      created(res);
      (script[n] ?? ((r) => text(r, "SCRIPT-EXHAUSTED")))(res);
      completed(res);
      res.end();
    });
  })
  .listen(9100, () => console.log("[fake-model] listening on http://localhost:9100/v1"));
