# Firebase / FCM files for EAS Android builds

Django still sends push through Expo (`exp.host`). These files let the **EAS APK** receive FCM.

## Customer app (`mobile/`)

1. In [Firebase Console](https://console.firebase.google.com), add an Android app per package from `flavors/manifest.json` (`bundleIdAndroid`).
2. Download each `google-services.json`.
3. Save as:

   `credentials/google-services/<androidPackage>.json`

   Example: `credentials/google-services/com.ieorbit.demo.salon.json`

4. Copy `google-services.example.json` as a template if needed. Do not commit real files (gitignored).
5. Upload the Firebase **FCM V1** service-account JSON with `eas credentials` (Android). Never commit `*-firebase-adminsdk-*.json`.
6. Set `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env` and in EAS project environment variables, then rebuild.

### EAS upload (same pattern as ops)

- `.easignore` whitelists `mobile/credentials/google-services/*.json` so local files are sent to EAS.
- `eas-build-pre-install` runs `scripts/materialize-google-services.cjs`, which picks the file from `EXPO_PUBLIC_FLAVOR_KEY` + `flavors/manifest.json`.
- Alternatively set per-profile EAS env: `GOOGLE_SERVICES_JSON` (raw JSON or path) or `GOOGLE_SERVICES_JSON_BASE64`.

7. Sanket Pet Shop Google Sign-In (required or Google shows **Access blocked**):
   - Project: [`still-cipher-490712-n7`](https://console.cloud.google.com/apis/credentials?project=still-cipher-490712-n7) (number `373269001775`). **Wed360** is this project’s display name on the consent screen — rename it under [OAuth consent](https://console.cloud.google.com/auth/overview?project=still-cipher-490712-n7).
   - Customer Android client ID (already in Sanket EAS profiles):
     `373269001775-3fm125kisnkfcjbvqji1vtvegm2326na.apps.googleusercontent.com`
   - Customer builds also need the **Web** OAuth client ID in EAS env
     (`EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`, same project Web client as ops/website).
     Native `GoogleSignin.configure` uses the Web client for id tokens; the Android
     client must still exist in Google Cloud with the package + SHA-1 below.
   - Package `com.ieorbit.sanketpetshop` and EAS keystore SHA-1:
     `70:D2:64:E9:71:3D:41:4D:CA:D6:64:EA:E5:C4:B5:CB:52:3A:7E:99`
   - If the OAuth consent screen is still **Testing**, add the Gmail you use on the phone as a test user (or publish the consent screen).
   - The API must accept that Android client as a token audience (`GOOGLE_OAUTH_CUSTOMER_ANDROID_CLIENT_ID`).
   - Rebuild the APK after changing Google Cloud or this login code.

## Ops app (`apps/ops-mobile/`)

Package: `com.ieorbit.ops`. Place the real file at:

`apps/ops-mobile/credentials/google-services.json`

Required for `production-preview` Android push. Do not commit the file. `.easignore` still uploads it to EAS.

1. In Firebase, add an Android app with package `com.ieorbit.ops` and download `google-services.json`.
2. Upload the Firebase **FCM V1** service-account JSON with `eas credentials` (Android) on the ops EAS project (`b897b310-e21b-49ab-b58f-56b8da1867f3`).
3. After the first EAS Android keystore exists, add that keystore SHA-1 to the ops Android OAuth client so Google Sign-In works on the APK.
