import { BrowserApiError, isApiErrorBody } from "./errors";

export async function browserApi<TResponse>(
  path: string,
  init: RequestInit
): Promise<TResponse> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new BrowserApiError(body.error);
    }

    throw new BrowserApiError({
      code: "HTTP_ERROR",
      message: "Сталася неочікувана помилка. Спробуйте ще раз.",
      requestId: "unknown"
    });
  }

  return body as TResponse;
}
