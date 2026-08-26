"""
============================================================
UNIVERSAL CHATBOT FACTORY — LOCAL LLM SERVER
------------------------------------------------------------
Serves the shared GGUF model over HTTP for the Node backend.

Endpoints:
  POST /api/chat   { prompt, temperature?, max_tokens? } -> { response }
  GET  /health     -> { status: "ok", model, loaded }

Run:  python run_llm.py         (from the project root)
Port: 8000  (override with LOCAL_LLM_PORT)

The model path is resolved as:
  1. env LOCAL_MODEL_PATH  (if set)
  2. <this folder>/models/llm-model.gguf   (default, ships with the project)
============================================================
"""

import os
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from llama_cpp import Llama

# --- Configuration -----------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_MODEL = os.path.join(SCRIPT_DIR, "models", "llm-model.gguf")

MODEL_PATH = os.environ.get("LOCAL_MODEL_PATH", DEFAULT_MODEL)
PORT       = int(os.environ.get("LOCAL_LLM_PORT", "8000"))
N_CTX      = int(os.environ.get("LLM_N_CTX", "4096"))
N_THREADS  = int(os.environ.get("LLM_THREADS", "0")) or None      # None => auto
N_GPU      = int(os.environ.get("LLM_GPU_LAYERS", "0"))           # 0 => CPU only

# Stop sequences. IMPORTANT: do NOT stop on "\n\n" — that truncates any
# multi-paragraph / markdown answer at the first blank line (this was the old bug).
STOP = ["<|im_end|>", "<|eot_id|>", "<|endoftext|>", "</s>", "\nUser:", "\nSystem:", "User:", "System:"]

# --- Load the model once (shared by every bot) -------------------------------
if not os.path.exists(MODEL_PATH):
    raise SystemExit(
        f"\n[FATAL] Model file not found:\n  {MODEL_PATH}\n"
        f"Place your GGUF model there, or set LOCAL_MODEL_PATH in the environment.\n"
    )

print(f"[LLM] Loading model: {MODEL_PATH}")
print(f"[LLM] n_ctx={N_CTX}  n_gpu_layers={N_GPU}  threads={N_THREADS or 'auto'}")
llm = Llama(
    model_path=MODEL_PATH,
    n_ctx=N_CTX,
    n_threads=N_THREADS,
    n_gpu_layers=N_GPU,
    verbose=False,
)
print("[LLM] Model loaded successfully. Ready to serve.\n")

# llama-cpp is not safe for concurrent inference — serialize generations.
_infer_lock = threading.Lock()


class LLMHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # keep the console clean

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "model": os.path.basename(MODEL_PATH), "loaded": True})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/chat":
            self._send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}

            prompt = data.get("prompt", "")
            if not prompt:
                self._send_json(400, {"error": "missing prompt"})
                return

            temperature = float(data.get("temperature", 0.7))
            max_tokens = int(data.get("max_tokens", 512))
            max_tokens = max(1, min(max_tokens, 1024))  # clamp for safety

            with _infer_lock:
                out = llm(
                    prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stop=STOP,
                    echo=False,
                )
            text = out["choices"][0]["text"].strip()
            self._send_json(200, {"response": text})

        except Exception as e:
            print(f"[LLM] Inference error: {e}")
            self._send_json(500, {"error": str(e)})


def run():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), LLMHandler)
    print(f"[LLM] Serving on http://127.0.0.1:{PORT}  (POST /api/chat, GET /health)")
    print("[LLM] Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[LLM] Shutting down.")
        server.shutdown()


if __name__ == "__main__":
    run()
