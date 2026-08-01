import { browserApi } from "./browser";
import type { VerifyEmailBody, VerifyEmailResponse } from "./contracts";

export function verifyEmail(
  input: VerifyEmailBody
): Promise<VerifyEmailResponse> {
  return browserApi<VerifyEmailResponse>("/api/v1/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}
