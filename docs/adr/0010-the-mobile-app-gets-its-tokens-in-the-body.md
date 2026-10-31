# The Mobile app gets its tokens in the body, not in cookies

Browsers keep the refresh token, the pending Two-step sign-in and the remembered browser in `HttpOnly; SameSite=Strict` cookies. The Mobile app can't rely on those: React Native's cookie handling differs between Android and iOS, and the rules that make the cookies safe in a browser mean nothing in an app. So a request that sends `X-Nimbus-Client: mobile` gets each of them in the response body instead (`refreshToken`, `pendingToken`, `rememberedToken`), and the app sends them back in the body. The app keeps them in the phone's secure storage (iOS Keychain, Android Keystore) and the access token in memory only. It is the same `/api/auth/*` endpoints, not a second set: without the header nothing changes for browsers, refresh tokens still work once each and still belong to a Session, and `X-Requested-With: nimbus` is only required where a cookie is the credential.

## Considered Options

- **Keep cookies and let React Native's networking store them.** No API change, but it depends on each platform's cookie store, which can't be inspected or protected the way secure storage can, and loses the cookies' browser protections anyway.
- **Separate `/api/auth/mobile/*` endpoints.** Clearer to read, but every sign-in rule (Two-step, rate limits, the email verification gate, Security alerts) would exist twice and drift.
