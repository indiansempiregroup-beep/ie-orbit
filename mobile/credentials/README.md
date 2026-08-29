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

## Ops app (`apps/ops-mobile/`)

Package: `com.ieorbit.ops`. Place the real file at:

`apps/ops-mobile/credentials/google-services.json`

Required for `production-preview` Android push. Do not commit the file. `.easignore` still uploads it to EAS.

1. In Firebase, add an Android app with package `com.ieorbit.ops` and download `google-services.json`.
2. Upload the Firebase **FCM V1** service-account JSON with `eas credentials` (Android) on the ops EAS project (`b897b310-e21b-49ab-b58f-56b8da1867f3`).
3. After the first EAS Android keystore exists, add that keystore SHA-1 to the ops Android OAuth client so Google Sign-In works on the APK.
