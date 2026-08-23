# Firebase / FCM files for EAS Android builds

Django still sends push through Expo (`exp.host`). These files let the **EAS APK** receive FCM.

## Customer app (`mobile/`)

1. In [Firebase Console](https://console.firebase.google.com), add an Android app per package from `flavors/manifest.json` (`bundleIdAndroid`).
2. Download each `google-services.json`.
3. Save as:

   `credentials/google-services/<androidPackage>.json`

   Example: `credentials/google-services/com.ieplatform.demo.salon.json`

4. Copy `google-services.example.json` as a template if needed. Do not commit real files (gitignored).
5. Upload the Firebase **FCM V1** service-account JSON with `eas credentials` (Android). Never commit `*-firebase-adminsdk-*.json`.
6. Set `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env` and in EAS project environment variables, then rebuild.

## Ops app (`apps/ops-mobile/`)

Package: `com.ieplatform.ops`. Place the real file at:

`apps/ops-mobile/credentials/google-services.json`
