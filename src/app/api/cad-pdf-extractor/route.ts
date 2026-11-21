import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { forwardCadPdf } from "@/lib/cad-pdf-backend";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_MB = 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const EXTRACT_TIMEOUT_MS = 120_000;

type ExtractResult = {
  status: number;
  body: unknown;
};

function errorResponse(error: string, status: number, code: string | null = null) {
  return NextResponse.json({ error, code }, { status });
}

function toolRoot(): string {
  return path.resolve(process.cwd(), "cad-pdf-extractor");
}

function resolvePython(root: string): { command: string; args: string[] } {
  const configured = process.env.CAD_PDF_PYTHON ?? process.env.PYTHON_EXECUTABLE;
  if (configured) return { command: configured, args: [] };

  const venvPython =
    process.platform === "win32"
      ? path.join(root, ".venv", "Scripts", "python.exe")
      : path.join(root, ".venv", "bin", "python");
  if (existsSync(venvPython)) return { command: venvPython, args: [] };

  if (process.platform === "win32") return { command: "py", args: ["-3"] };
  return { command: "python3", args: [] };
}

function runLocalExtraction(
  file: File,
  options: {
    password: string;
    previewDpi: string;
    maxPreviewPages: string;
    countVectors: string;
  },
): Promise<ExtractResult> {
  const root = toolRoot();
  const cliPath = path.join(root, "backend", "cli.py");

  if (!existsSync(cliPath)) {
    return Promise.resolve({
      status: 500,
      body: {
        error: "The CAD PDF extraction engine was not found (cad-pdf-extractor/backend/cli.py).",
        code: "backend_missing",
      },
    });
  }

  const python = resolvePython(root);

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (result: ExtractResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const child = spawn(python.command, [...python.args, cliPath], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        CAD_FILENAME: file.name,
        CAD_PASSWORD: options.password,
        CAD_PREVIEW_DPI: options.previewDpi,
        CAD_MAX_PREVIEW_PAGES: options.maxPreviewPages,
        CAD_COUNT_VECTORS: options.countVectors,
      },
    });

    const timer = setTimeout(() => {
      child.kill();
      finish({
        status: 504,
        body: {
          error: "The extraction timed out. Try a smaller PDF or lower the preview settings.",
          code: "timeout",
        },
      });
    }, EXTRACT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.stdin.on("error", () => {
      /* the child may exit before reading; the close handler reports it */
    });

    child.on("error", (err) => {
      finish({
        status: 502,
        body: {
          error:
            "Could not start the Python extraction engine. Install its requirements and set CAD_PDF_PYTHON if needed. " +
            `(${err.message})`,
          code: "backend_unreachable",
        },
      });
    });

    child.on("close", () => {
      let parsed: unknown = null;
      try {
        parsed = stdout ? JSON.parse(stdout) : null;
      } catch {
        parsed = null;
      }

      if (!parsed || typeof parsed !== "object") {
        finish({
          status: 502,
          body: {
            error:
              "The Python extractor returned an unreadable response." +
              (stderr ? `\n${stderr.trim().split("\n").slice(-3).join("\n")}` : ""),
            code: "backend_error",
          },
        });
        return;
      }

      const data = parsed as { error?: string; status?: number };
      if (typeof data.error === "string") {
        finish({
          status: typeof data.status === "number" ? data.status : 422,
          body: parsed,
        });
        return;
      }

      finish({ status: 200, body: parsed });
    });

    file
      .arrayBuffer()
      .then((buffer) => {
        child.stdin.write(Buffer.from(buffer));
        child.stdin.end();
      })
      .catch((err: Error) => {
        child.kill();
        finish({
          status: 400,
          body: { error: `Could not read the uploaded file: ${err.message}`, code: "read_error" },
        });
      });
  });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Invalid upload. Please send the PDF as multipart form data.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse("No PDF file was provided.", 400);
  }
  if (file.size === 0) {
    return errorResponse("The uploaded file is empty. Please choose a PDF file.", 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return errorResponse(`The file is larger than ${MAX_UPLOAD_MB} MB. Please use a smaller PDF.`, 413);
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".pdf") && file.type !== "application/pdf") {
    return errorResponse("Unsupported file: this does not appear to be a PDF document.", 400);
  }

  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  let hasPdfHeader = false;
  for (let i = 0; i + 3 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46) {
      hasPdfHeader = true;
      break;
    }
  }
  if (!hasPdfHeader) {
    return errorResponse(
      "Unsupported file: this does not appear to be a PDF document (missing %PDF header).",
      400,
    );
  }

  const backendUrl = process.env.CAD_PDF_API_URL;
  const result = backendUrl
    ? await forwardCadPdf(file, form, backendUrl)
    : await runLocalExtraction(file, {
        password: typeof form.get("password") === "string" ? String(form.get("password")) : "",
        previewDpi: String(form.get("preview_dpi") ?? ""),
        maxPreviewPages: String(form.get("max_preview_pages") ?? ""),
        countVectors: String(form.get("count_vectors") ?? ""),
      });

  if (!result.body) {
    return errorResponse("The CAD PDF extractor returned an unreadable response.", 502);
  }

  return NextResponse.json(result.body, { status: result.status });
}
