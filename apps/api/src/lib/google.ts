import { OAuth2Client } from "google-auth-library";
import { env } from "../env.js";
import { HttpError } from "./http.js";

const client = new OAuth2Client();

/**
 * Checks a Google ID token (signature, expiry, and that it was issued for our client ID) and returns the verified
 * email, lower-cased. Both the web button and the Android app ask Google for a token addressed to the web client ID.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<string> {
  if (!env.googleClientId) throw new HttpError(404, "Google sign-in is not set up on this server");
  let payload;
  try {
    payload = (await client.verifyIdToken({ idToken, audience: env.googleClientId })).getPayload();
  } catch {
    throw new HttpError(401, "Google sign-in failed. Please try again.");
  }
  if (!payload?.email || !payload.email_verified) throw new HttpError(401, "Your Google account's email is not verified");
  return payload.email.toLowerCase();
}
