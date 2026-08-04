export const STAGE7_DESKTOP_TOKEN = "D".repeat(43);
export const STAGE7_MOBILE_TOKEN = "M".repeat(43);

export const STAGE7_EMAIL_VERIFICATION_FIXTURES = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    name: "Stage 7 Desktop",
    email: "stage7.desktop@example.com",
    password: "Stage7Desktop123!",
    token: STAGE7_DESKTOP_TOKEN
  },
  {
    id: "70000000-0000-4000-8000-000000000002",
    name: "Stage 7 Mobile",
    email: "stage7.mobile@example.com",
    password: "Stage7Mobile123!",
    token: STAGE7_MOBILE_TOKEN
  }
] as const;

export const STAGE7_MOBILE_ACCOUNT = STAGE7_EMAIL_VERIFICATION_FIXTURES[1];
