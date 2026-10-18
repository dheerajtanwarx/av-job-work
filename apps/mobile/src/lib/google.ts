import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";

/**
 * Opens Google's account picker and returns an ID token for the API to check, or null if the user backed out.
 * `webClientId` is the API's GOOGLE_CLIENT_ID: Android asks Google for a token addressed to it, which is what the API
 * verifies. (Google also needs an Android OAuth client for this app's package + signing SHA-1, or sign-in fails.)
 */
export async function googleIdToken(webClientId: string): Promise<string | null> {
  GoogleSignin.configure({ webClientId });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last Google account so a shared phone always shows the picker.
    await GoogleSignin.signOut().catch(() => {});
    const r = await GoogleSignin.signIn();
    if (!isSuccessResponse(r)) return null;
    if (!r.data.idToken) throw new Error("Google didn't return a sign-in token. Please try again.");
    return r.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error("Google Play services is needed to sign in with Google.");
      throw new Error("Google sign-in failed. Please try again.");
    }
    throw e;
  }
}
