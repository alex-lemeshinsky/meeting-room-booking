export function csrfTokenFromCookie(): string {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith("mrb_csrf="));

  return cookie ? decodeURIComponent(cookie.slice("mrb_csrf=".length)) : "";
}
