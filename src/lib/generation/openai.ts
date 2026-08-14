import "server-only";
import { serverEnv } from "@/lib/env/server";

const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const TIMEOUT_MS = 60_000;

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export type GeneratedImage = {
  png: Buffer;
  width: number;
  height: number;
  model: string;
};

/**
 * Calls the OpenAI Images API directly via fetch — no SDK dependency.
 * Errors are normalized so the API key or raw provider payloads never leak
 * into a response.
 */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const model = serverEnv.OPENAI_IMAGE_MODEL;
  const size = "1024x1024";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size,
        output_format: "png",
        background: "transparent",
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Image generation timed out. Please try again.");
    }
    throw new ProviderError("Could not reach the image provider.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new ProviderError(await normalizeErrorMessage(response), response.status);
  }

  let b64: string | undefined;
  try {
    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string }>;
    };
    b64 = payload.data?.[0]?.b64_json;
  } catch {
    // fall through to the missing-image error below
  }
  if (!b64) {
    throw new ProviderError("The image provider returned no image.");
  }

  const [width, height] = size.split("x").map(Number);
  return { png: Buffer.from(b64, "base64"), width, height, model };
}

async function normalizeErrorMessage(response: Response): Promise<string> {
  let providerMessage = "";
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    providerMessage = payload.error?.message ?? "";
  } catch {
    // ignore unparseable bodies
  }
  // Never echo anything that could contain a key.
  providerMessage = providerMessage.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");

  switch (response.status) {
    case 400:
      return providerMessage
        ? `The image provider rejected the prompt: ${providerMessage}`
        : "The image provider rejected the prompt.";
    case 401:
    case 403:
      return "The image provider rejected the server credentials. Check OPENAI_API_KEY.";
    case 429:
      return "The image provider is rate limiting. Try again in a moment.";
    default:
      return "The image provider failed. Please try again.";
  }
}
