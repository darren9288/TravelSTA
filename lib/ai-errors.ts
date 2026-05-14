// Maps an upstream Anthropic / proxy HTTP status into a friendlier user-facing
// message so non-technical friends don't see things like "Upstream 401" when
// a token expires. Returns the message and a suggested HTTP status for the
// app's own response (we use 503 for "service unavailable" cases so callers
// can distinguish them from generic 500s if they want).

export type AIErrorMapping = {
  status: number;          // status to return from our route
  message: string;         // friendly user-facing message
  technical?: string;      // raw upstream detail (only included for admin contexts)
};

export function mapUpstreamError(
  upstreamStatus: number,
  upstreamBody?: string
): AIErrorMapping {
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return {
      status: 503,
      message:
        "The AI service is unavailable right now — the API key needs attention from the admin. Please try again later.",
      technical: `Upstream ${upstreamStatus}: ${upstreamBody?.slice(0, 200) ?? ""}`.trim(),
    };
  }
  if (upstreamStatus === 429) {
    return {
      status: 503,
      message:
        "AI is busy at the moment (rate limited). Please wait a few seconds and try again.",
      technical: `Upstream 429: ${upstreamBody?.slice(0, 200) ?? ""}`.trim(),
    };
  }
  if (upstreamStatus === 529 || upstreamStatus === 503) {
    return {
      status: 503,
      message:
        "AI service is temporarily overloaded. Please try again in a minute.",
      technical: `Upstream ${upstreamStatus}: ${upstreamBody?.slice(0, 200) ?? ""}`.trim(),
    };
  }
  if (upstreamStatus >= 500) {
    return {
      status: 503,
      message:
        "AI service hit an error. Please try again — if it keeps happening, let the admin know.",
      technical: `Upstream ${upstreamStatus}: ${upstreamBody?.slice(0, 200) ?? ""}`.trim(),
    };
  }
  return {
    status: 500,
    message: "Couldn't reach the AI service. Please try again.",
    technical: `Upstream ${upstreamStatus}: ${upstreamBody?.slice(0, 200) ?? ""}`.trim(),
  };
}
