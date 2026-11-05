import { pbkdf2 } from "react-native-quick-crypto";

/** Native worker-thread PBKDF2; matches the web verifier without blocking the JS thread. */
export function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, 600_000, 32, "sha256", (error, key) => {
      if (error || !key) {
        reject(
          error ??
            new Error("Unable to protect your password. Please try again."),
        );
        return;
      }
      resolve(key.toString("hex"));
    });
  });
}
