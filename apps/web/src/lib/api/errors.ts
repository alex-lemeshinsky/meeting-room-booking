export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    requestId: string;
  };
}

export class BrowserApiError extends Error {
  readonly code: string;
  readonly fields: Record<string, string[]>;
  readonly requestId: string;

  constructor(error: ApiErrorBody["error"]) {
    super(error.message);
    this.name = "BrowserApiError";
    this.code = error.code;
    this.fields = error.fields ?? {};
    this.requestId = error.requestId;
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }

  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "requestId" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string" &&
    typeof error.requestId === "string" &&
    (!("fields" in error) || isFieldErrors(error.fields))
  );
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.every((message) => typeof message === "string")
    )
  );
}
