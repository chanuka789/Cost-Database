export const PASSWORD_MIN_LENGTH = 10;
export const BCRYPT_ROUNDS = 12;

/** Returns a message for the first rule the password breaks, or null if it is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 200) return "Use 200 characters or fewer.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Use both letters and numbers.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase()) && email.split("@")[0].length >= 4) {
    return "Don't include your email name in the password.";
  }
  return null;
}
