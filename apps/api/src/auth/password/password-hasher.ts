export const PASSWORD_HASHER = Symbol("PasswordHasher");

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
  burnUnknownPasswordCheck(password: string): Promise<void>;
}
