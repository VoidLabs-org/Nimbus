// Generated from docs/specs/openapi.yaml by `pnpm --filter @repo/api generate`. Don't edit: change the contract and
// generate again.

export interface paths {
    "/api/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The projects the User is a Member of
         * @description Active projects only: Archived ones are left out. Sorted by lower-cased name, then by key, in code, so the order is the same on every database. No paging. Requires a verified email.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The projects, empty when the User is not a Member of any */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Project"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Email not verified (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        /**
         * Create a project and become its first Member
         * @description Requires a verified email. The project and membership are saved together.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateProjectRequest"];
                };
            };
            responses: {
                /** @description Project created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Project"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                /** @description Email not verified (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Project key is already taken, including by an Archived project; errors.key explains the conflict */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Open a project the User is a Member of */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project key, matched case-insensitively */
                    key: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project details */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Project"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Email not verified (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Project not found (also returned for a non-Member) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the caller's Notifications, newest first
         * @description Requires a verified User. Ordered by createdAt descending, then id descending. The cursor resumes after the last item, including when timestamps are equal. Display content is a stored snapshot; reading never looks up the current device or User.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Opaque nextCursor from the previous page */
                    before?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The caller's Notifications */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationPage"];
                    };
                };
                /** @description Invalid cursor or limit */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/unread-count": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Count the caller's unread Notifications */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Unread count */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: int64 */
                            count: number;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark one of the caller's Notifications as read */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Marked read, including when already read */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Invalid Notification id */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Notification does not exist or belongs to another User */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/notifications/read-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark all of the caller's Notifications as read */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description All of the caller's Notifications are read */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/notification-settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The caller's email switches for Issue Notification types
         * @description Requires a verified User. Always lists the five Issue types in a fixed order. Email defaults to on except for ISSUE_EDITED. In-app Notifications and Security alerts are always on and not listed.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description One entry per Issue type */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["NotificationSetting"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/notification-settings/{type}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Switch email on or off for one Issue Notification type
         * @description Requires a verified User. Only switches that differ from the default are stored; saving the default removes the stored switch. Security alert types and unknown types give 400.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    type: components["schemas"]["IssueNotificationType"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: boolean;
                    };
                };
            };
            responses: {
                /** @description Saved */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Unknown type, a Security alert type, or a missing email */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description Unverified User (code: email_unverified) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register with email and password, and sign in straight away */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["RegisterRequest"];
                };
            };
            responses: {
                /** @description User created and signed in */
                201: {
                    headers: {
                        "Set-Cookie": components["headers"]["RefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResponse"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                /** @description The email is already registered */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in with email and password
         * @description For a User with Two-step verification a right password starts no session: the answer is `{twoStepRequired: true}` with no token and no refresh cookie, and the `two_step_pending` cookie that `POST /api/auth/two-step` needs to finish the sign-in with a Sign-in code. A `two_step_remembered` cookie that remembers this User's browser (unexpired, see `POST /api/auth/two-step`) skips the code.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["LoginRequest"];
                };
            };
            responses: {
                /** @description Signed in, or (with Two-step verification) a Sign-in code is needed */
                200: {
                    headers: {
                        /** @description The refresh cookie when signed in (see `RefreshCookie`); otherwise the pending cookie (see the `twoStepPendingCookie` scheme) */
                        "Set-Cookie"?: string;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResponse"] | {
                            /** @constant */
                            twoStepRequired: true;
                        };
                    };
                };
                400: components["responses"]["InvalidFields"];
                /** @description Invalid email or password (the same for an unknown email, a wrong password and a User without a password) */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/two-step": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Finish a password sign-in with a Sign-in code or a Recovery code
         * @description Checks a Sign-in code from the User's authenticator app, or one of their Recovery codes, for the pending sign-in in the `two_step_pending` cookie. One 30-second step either side of now is accepted, but never the step that last signed the User in or an older one. A Recovery code is compared with capitals, spaces and the dash ignored, works once, and publishes `RecoveryCodeUsed` when used. A right code starts the session as `POST /api/auth/login` does and ends the pending sign-in. A pending sign-in lasts 5 minutes and allows 5 wrong codes. A refresh never comes here. With `rememberBrowser: true` a right code also sets `two_step_remembered` (HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age 30 days): password and Google/GitHub sign-ins of this User on this browser skip the code for a fixed 30 days, until a password change or reset, Remove, or "Sign out all other devices" elsewhere.
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description Must be `nimbus`. Cross-site forms can't set it, so other sites can't use the cookie. */
                    "X-Requested-With": "nimbus";
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 123456 */
                        code?: string;
                        /** @example k7qx-2m9d */
                        recoveryCode?: string;
                        /**
                         * @description Don't ask again on this device for 30 days.
                         * @default false
                         */
                        rememberBrowser?: boolean;
                    };
                };
            };
            responses: {
                /** @description Signed in; the pending cookie is cleared, and with `rememberBrowser` the `two_step_remembered` cookie is set too */
                200: {
                    headers: {
                        "Set-Cookie": components["headers"]["RefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResponse"];
                    };
                };
                /** @description The code is wrong or isn't 6 digits, or the Recovery code is wrong or used already (`code: invalid_code`, with `triesLeft`), or either is over 64 characters (`errors.code`, `errors.recoveryCode`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            triesLeft?: number;
                        };
                    };
                };
                /** @description `code: sign_in_expired`: the pending sign-in is missing, unknown, used or older than 5 minutes, or this was its 5th wrong code. Clears the pending cookie; the User signs in again. */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The X-Requested-With header is missing or not `nimbus` */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The User got `nimbus.auth.wrong-sign-in-codes-per-hour` (default 10) codes wrong in the last hour, across sign-ins, setup and View new codes; every code check is refused until `Retry-After` seconds have passed */
                429: {
                    headers: {
                        "Retry-After"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/desktop/exchange": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The Desktop app trades a one-time code from the browser for the sign-in
         * @description After "Continue with Google or GitHub" in the system browser (ADR 0008), the Desktop app's page sends the code the browser handed back and the verifier whose hash started the handshake. A code lasts 60 seconds and works once; a wrong verifier also ends it. It signs in as the browser's callback would, but with this request's `User-Agent` (the Session's device) and `two_step_remembered` cookie: either the refresh cookie (then load `/auth/callback`) or, for a User with Two-step verification, the `two_step_pending` cookie (then `/login/two-step`).
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description Must be `nimbus`. It sets cookies, so cross-site forms must not reach it. */
                    "X-Requested-With": "nimbus";
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DesktopCode"];
                };
            };
            responses: {
                /** @description `twoStepRequired: false` with the refresh cookie set, or `true` with the `two_step_pending` cookie set */
                200: {
                    headers: {
                        /** @description The refresh cookie (see `RefreshCookie`), or the pending cookie (see the `twoStepPendingCookie` scheme) */
                        "Set-Cookie"?: string;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            twoStepRequired: boolean;
                        };
                    };
                };
                /** @description `code: expired` (unknown, used, older than 60 seconds, a connect's code, or the wrong verifier), `email_unverified` or `disconnected`, as on the sign-in page; or a field over 256 characters (`errors`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The X-Requested-With header is missing or not `nimbus` */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/desktop/connect": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * The Desktop app finishes connecting a provider from Security
         * @description For a connect started in the system browser with a link ticket (ADR 0008). The ticket must have been issued to this access token's Session (instead of the `link_binder` cookie, which stays in the app); then the provider account is connected as on the callback in a browser.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DesktopCode"];
                };
            };
            responses: {
                /** @description Connected */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example github */
                            provider: string;
                        };
                    };
                };
                /** @description `code: expired` (the code as for the exchange, a sign-in's code, or a ticket that is used, expired or another Session's), `email_unverified`, `already_linked` or `already_connected`, as on the Security page */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description No valid access token, or its Session has ended */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/oauth2/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Start "Continue with Google"
         * @description Open it with a full page load (a link, not `fetch`): the browser is redirected to Google and back. The handshake keeps a short-lived HTTP session; nothing else in the API does. Only available when `GOOGLE_CLIENT_ID` is set.
         */
        get: {
            parameters: {
                query?: {
                    /** @description The page to land on after signing in, e.g. `/projects/42`. Kept in the handshake's session (never sent to the provider) and passed back as `returnTo` on the redirect that ends the handshake. Ignored unless it is a path inside the app: one leading `/`, not `/` alone, no control characters, at most 2048 characters. */
                    returnTo?: components["parameters"]["ReturnTo"];
                    /** @description A ticket from `POST /api/users/me/linked-identities/{provider}/link-ticket`. With it the handshake connects the provider account to that ticket's User instead of signing anyone in: no session, no refresh cookie. It ends at `/settings/security?connected=<provider>`, or `/settings/security?error=<code>&provider=<provider>` with `already_linked`, `already_connected`, `email_unverified`, `cancelled`, `failed` or `expired`. */
                    link?: components["parameters"]["LinkTicket"];
                    /** @description The Desktop app only (ADR 0008): base64url SHA-256 of the app's verifier (RFC 7636 S256, 43 characters). Together with `port` and `nonce` it makes the handshake end at the app's port on `127.0.0.1` with a one-time code instead of signing the browser in. When any of the three is missing or malformed, the handshake ends in the browser as usual. */
                    desktop?: components["parameters"]["DesktopChallenge"];
                    /** @description The Desktop app's port on `127.0.0.1`, which the browser takes the result to. The host is never taken from the request. */
                    port?: components["parameters"]["DesktopPort"];
                    /** @description The random path of this attempt on the Desktop app's port. */
                    nonce?: components["parameters"]["DesktopNonce"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Redirect to Google's sign-in page */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/oauth2/callback/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Where Google sends the browser back to (not called by the web app)
         * @description Signs the User in or creates them, linking the Google login (see the identity module spec for the rules). On success it sets the refresh cookie and redirects to `/auth/callback` on the public URL (`PUBLIC_URL`), where the web app calls `POST /api/auth/refresh` for an access token; no token is ever in a URL. A User with Two-step verification gets no session and no refresh cookie yet: the `two_step_pending` cookie and a redirect to `/login/two-step`, where `POST /api/auth/two-step` finishes the sign-in. A `returnTo` kept when the sign-in started is added to every redirect as `&returnTo=<page>` (or `?returnTo=`). On failure it redirects to `/login?error=<code>&provider=google` on the public URL with `email_unverified` (Google did not verify the email), `disconnected` (the User on that email disconnected Google), `cancelled` (the person declined at Google) or `failed` (anything else). A handshake the Desktop app started (`desktop`, `port`, `nonce`) signs nobody in here and sets no cookie: it redirects to `http://127.0.0.1:<port>/<nonce>?code=<one-time code>`, or `?error=cancelled|failed&provider=<id>`, and the app finishes with `POST /api/auth/desktop/exchange` or `POST /api/auth/desktop/connect` (ADR 0008).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Authorization code from Google */
                    code?: string;
                    state?: string;
                    /** @description Set by Google instead of `code`, e.g. `access_denied` */
                    error?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Redirect to `/auth/callback` (with the refresh cookie set), to `/login/two-step` (with the pending cookie set) or to `/login?error=<code>` */
                302: {
                    headers: {
                        /** @description The refresh cookie (see `RefreshCookie`), or the pending cookie (see the `twoStepPendingCookie` scheme) */
                        "Set-Cookie"?: string;
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/oauth2/github": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Start "Continue with GitHub"
         * @description Open it with a full page load (a link, not `fetch`): the browser is redirected to GitHub and back. The handshake keeps a short-lived HTTP session; nothing else in the API does. Only available when `GITHUB_CLIENT_ID` is set.
         */
        get: {
            parameters: {
                query?: {
                    /** @description The page to land on after signing in, e.g. `/projects/42`. Kept in the handshake's session (never sent to the provider) and passed back as `returnTo` on the redirect that ends the handshake. Ignored unless it is a path inside the app: one leading `/`, not `/` alone, no control characters, at most 2048 characters. */
                    returnTo?: components["parameters"]["ReturnTo"];
                    /** @description A ticket from `POST /api/users/me/linked-identities/{provider}/link-ticket`. With it the handshake connects the provider account to that ticket's User instead of signing anyone in: no session, no refresh cookie. It ends at `/settings/security?connected=<provider>`, or `/settings/security?error=<code>&provider=<provider>` with `already_linked`, `already_connected`, `email_unverified`, `cancelled`, `failed` or `expired`. */
                    link?: components["parameters"]["LinkTicket"];
                    /** @description The Desktop app only (ADR 0008): base64url SHA-256 of the app's verifier (RFC 7636 S256, 43 characters). Together with `port` and `nonce` it makes the handshake end at the app's port on `127.0.0.1` with a one-time code instead of signing the browser in. When any of the three is missing or malformed, the handshake ends in the browser as usual. */
                    desktop?: components["parameters"]["DesktopChallenge"];
                    /** @description The Desktop app's port on `127.0.0.1`, which the browser takes the result to. The host is never taken from the request. */
                    port?: components["parameters"]["DesktopPort"];
                    /** @description The random path of this attempt on the Desktop app's port. */
                    nonce?: components["parameters"]["DesktopNonce"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Redirect to GitHub's sign-in page */
                302: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/oauth2/callback/github": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Where GitHub sends the browser back to (not called by the web app)
         * @description Signs the User in or creates them, linking the GitHub login (see the identity module spec for the rules). On success it sets the refresh cookie and redirects to `/auth/callback` on the public URL (`PUBLIC_URL`), where the web app calls `POST /api/auth/refresh` for an access token; no token is ever in a URL. A User with Two-step verification gets no session and no refresh cookie yet: the `two_step_pending` cookie and a redirect to `/login/two-step`, where `POST /api/auth/two-step` finishes the sign-in. A `returnTo` kept when the sign-in started is added to every redirect as `&returnTo=<page>` (or `?returnTo=`). On failure it redirects to `/login?error=<code>&provider=github` on the public URL with `email_unverified` (the GitHub account has no verified primary email), `disconnected` (the User on that email disconnected GitHub), `cancelled` (the person declined at GitHub) or `failed` (anything else). A handshake the Desktop app started (`desktop`, `port`, `nonce`) signs nobody in here and sets no cookie: it redirects to `http://127.0.0.1:<port>/<nonce>?code=<one-time code>`, or `?error=cancelled|failed&provider=<id>`, and the app finishes with `POST /api/auth/desktop/exchange` or `POST /api/auth/desktop/connect` (ADR 0008).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Authorization code from GitHub */
                    code?: string;
                    state?: string;
                    /** @description Set by GitHub instead of `code`, e.g. `access_denied` */
                    error?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Redirect to `/auth/callback` (with the refresh cookie set), to `/login/two-step` (with the pending cookie set) or to `/login?error=<code>` */
                302: {
                    headers: {
                        /** @description The refresh cookie (see `RefreshCookie`), or the pending cookie (see the `twoStepPendingCookie` scheme) */
                        "Set-Cookie"?: string;
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Renew the session from the refresh cookie and get a new access token
         * @description Exchanges the refresh cookie for a new one (rotation). A refresh token works once: presenting a used one revokes its whole session.
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description Must be `nimbus`. Cross-site forms can't set it, so other sites can't use the cookie. */
                    "X-Requested-With": "nimbus";
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Session renewed */
                200: {
                    headers: {
                        "Set-Cookie": components["headers"]["RefreshCookie"];
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthResponse"];
                    };
                };
                /** @description The cookie is missing, unknown, expired, revoked or already used */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The X-Requested-With header is missing or not `nimbus` */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign out of this browser
         * @description Ends the session the refresh cookie belongs to, even if that token was already rotated, and clears the cookie. Other sessions of the same User are not affected. Succeeds with no cookie, an unknown cookie or a session that is already over.
         */
        post: {
            parameters: {
                query?: never;
                header: {
                    /** @description Must be `nimbus`. Cross-site forms can't set it, so other sites can't sign a User out. */
                    "X-Requested-With": "nimbus";
                };
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Signed out; the refresh cookie is cleared (`Max-Age=0`) */
                204: {
                    headers: {
                        /** @description `refresh_token=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=0` */
                        "Set-Cookie"?: string;
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The X-Requested-With header is missing or not `nimbus` */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify the signed-in User's email with the code emailed to them
         * @description Needs the access token of a signed-in User, who may be unverified (this is how they stop being). A right code marks the email verified, deletes the code and publishes `EmailVerified`. A User who is already verified gets `200` again. A wrong try is counted; the fifth wrong try cancels the code.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The 6 digits from the email. Spaces are ignored. */
                        code: string;
                    };
                };
            };
            responses: {
                /** @description The User, now verified */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description The code is missing or malformed (`errors.code`), wrong (`code` is `invalid_code`, with `triesLeft`), or there is no live code (`code` is `code_expired`: expired, cancelled after 5 wrong tries, or never issued) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            triesLeft?: number;
                            errors?: {
                                [key: string]: string;
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/verify-email/resend": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Email the signed-in User a new Verification code
         * @description Needs the access token of a signed-in User, who may be unverified. Issues a new code, which replaces and cancels the old one, and emails it after commit. Emails to one address are at least 60 seconds apart and at most 5 an hour; the send at registration counts.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description A new code was issued and emailed */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Not signed in */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The email is already verified */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Too many emails to this address; the live code is unchanged */
                429: {
                    headers: {
                        /** @description Seconds until a send is allowed */
                        "Retry-After"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password-reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Email a Reset code to a User who forgot their password
         * @description Always `204`, whether or not a User has the email, so the answer never says who is registered. For a registered email (Users with no password included) a Reset code is issued, replacing any live one, and emailed. The lookup, the code and the send all happen after the response, and a failure is logged, never shown.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Any case; surrounding whitespace is ignored */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description Accepted. A code is on its way if the email is registered */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["InvalidFields"];
                /** @description This IP address asked too often, or the email was mailed too recently or too often (the shared send budget, spent for any email typed, registered or not). Nothing is sent and a live code is unchanged. */
                429: {
                    headers: {
                        /** @description Seconds until another request may succeed */
                        "Retry-After"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/password-reset/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set a new password with the Reset code from the email
         * @description A right code sets the password, deletes the code, marks the email verified (publishing `EmailVerified` if it wasn't), ends every session of the User and clears the failed sign-ins for the email. The User is not signed in. A wrong try is counted; the fifth cancels the code. An unknown email gets the same answer as an expired code. A new password that breaks the rule, or a malformed code, is refused without counting a try. A User with Two-step verification also needs `twoStepCode` (a Sign-in code) or `recoveryCode` (ADR 0005): only once the Reset code is right, a missing one answers `two_step_required` and a wrong one `invalid_two_step_code`, and either way nothing changes and the Reset code stays usable with its tries. A right Recovery code is used up and publishes `RecoveryCodeUsed`. Two-step verification stays on.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: string;
                        /** @description The 6 digits from the email. Spaces are ignored. */
                        code: string;
                        newPassword: string;
                        /**
                         * @description For a User with Two-step verification, a Sign-in code from their authenticator app; ignored when `recoveryCode` is given, and for Users without Two-step verification.
                         * @example 123456
                         */
                        twoStepCode?: string;
                        /**
                         * @description For a User with Two-step verification who lost their phone, one of their Recovery codes (capitals, spaces and dashes ignored). A blank one counts as none.
                         * @example k7qx-2m9d
                         */
                        recoveryCode?: string;
                    };
                };
            };
            responses: {
                /** @description The password was changed; sign in with it */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description A field is invalid (`errors.newPassword`, `errors.code`, `errors.email`), the code is wrong (`code` is `invalid_code`, with `triesLeft`), or there is no live code for the email (`code` is `code_expired`: expired, cancelled after 5 wrong tries, never issued, or no User has the email). With a right Reset code, a User with Two-step verification gets `two_step_required` without a second code, or `invalid_two_step_code` for a wrong one (which counts toward the hourly lock on code checks) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            /** @enum {string} */
                            code?: "invalid_code" | "code_expired" | "two_step_required" | "invalid_two_step_code";
                            triesLeft?: number;
                            errors?: {
                                [key: string]: string;
                            };
                        };
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which sign-in providers are enabled
         * @description Public, no access token needed. The providers whose client id is set (`GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID`), in the order to show them: `google`, then `github`. The web app shows "Continue with ..." only for these, and each listed provider has its `/api/auth/oauth2/<provider>` address.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The enabled providers; empty when none is set up */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers: ("google" | "github")[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The signed-in User */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The signed-in User */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Change the signed-in User's display name
         * @description Only the display name can be changed here. Other properties in the body are ignored.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["UpdateProfileRequest"];
                };
            };
            responses: {
                /** @description The updated User */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
            };
        };
        trace?: never;
    };
    "/api/users/me/password": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Set or change the signed-in User's password
         * @description A User without a password (they only sign in with Google or GitHub) sets one; `currentPassword` is ignored. A User with one must give it as `currentPassword`. The request must come from a session that is still running. Changing an existing password ends every other session of the User; setting a first one ends none. This browser stays signed in.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ChangePasswordRequest"];
                };
            };
            responses: {
                /** @description The password is set */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                429: components["responses"]["TooManyAttempts"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm it's you, so an old sign-in can change the email
         * @description The password and, for a User with Two-step verification, a Sign-in code or an unused Recovery code. A right answer lets this session change the email (`/api/users/me/email-change`) for the next `nimbus.auth.link-recent-sign-in` (default 10 minutes), as a fresh sign-in would. Connecting a provider and setting up Two-step verification still need a recent sign-in. The password is checked first, so a wrong one never says whether the User has Two-step verification. The session must be still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        password?: string;
                        /** @description The 6 digits from the authenticator app; only with Two-step verification. */
                        twoStepCode?: string;
                        /** @description One of the User's Recovery codes, instead of `twoStepCode`. */
                        recoveryCode?: string;
                    };
                };
            };
            responses: {
                /** @description Confirmed */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The password is wrong or missing (`errors.password`), or with Two-step verification the second code is missing (`code: two_step_required`) or wrong or used (`code: invalid_two_step_code`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            errors?: {
                                [key: string]: string;
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description The User has no password (`code: no_password`): they sign in again instead */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/email-change": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Email a Verification code to the address the signed-in User wants as their email
         * @description Starts an email change, or replaces the pending one and its code: a 6-digit code goes to the new address after commit, and the email changes only once it is entered (`/api/users/me/email-change/confirm`). Resend is the same call. The session must have started, or been confirmed (`/api/users/me/confirm`), within `nimbus.auth.link-recent-sign-in` (default 10 minutes) and be still running. Sends spend the new address's send budget (60 seconds apart, 5 an hour). A pending change doesn't hold the address. Unverified Users get `403 email_unverified`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /**
                         * Format: email
                         * @description Surrounding whitespace is ignored; compared and stored lower-cased.
                         */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description A code was issued and emailed to the new address */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The email is invalid (`errors.email`), or it is already the User's email (`code: same_email`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            errors?: {
                                [key: string]: string;
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Not allowed: the sign-in is too old (`code: reauth_required`), or the User is Unverified (`code: email_unverified`) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Another User has this email (`code: email_taken`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Too many emails to this address; nothing is issued and a pending change is unchanged */
                429: {
                    headers: {
                        /** @description Seconds until a send is allowed */
                        "Retry-After"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/email-change/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Change the signed-in User's email with the code emailed to the new address
         * @description A right code changes the email to the pending address (it stays verified) and uses the code up. Sessions, the password, Two-step verification and Linked identities don't change. A wrong try is counted; the fifth cancels the change. The recent sign-in is not checked again. The session must be still running. Unverified Users get `403 email_unverified`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The 6 digits from the email. Spaces are ignored. */
                        code: string;
                    };
                };
            };
            responses: {
                /** @description The User, with the new email */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description The code is missing or malformed (`errors.code`), wrong (`code` is `invalid_code`, with `triesLeft`), or no change is pending (`code` is `code_expired`: expired, cancelled after 5 wrong tries, or never asked for) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"] & {
                            triesLeft?: number;
                            errors?: {
                                [key: string]: string;
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description Another User took the address since the code was sent (`code: email_taken`); the email is unchanged and the code is not used up */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/profile-picture": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Upload the signed-in User's Profile picture
         * @description Stores a JPEG, PNG or WebP of at most 5 MB as the User's uploaded photo, cropped to its centred square, resized to 256x256 and re-encoded as JPEG without metadata, and shows it. The photo gets a new address on every upload. Needs a running Session and a verified email. A User may upload 10 photos in an hour.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** Format: binary */
                        file: string;
                    };
                };
            };
            responses: {
                /** @description The User, whose `avatarUrl` is now the uploaded photo's address */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description The file is over 5 MB (`code: file_too_large`), isn't a JPEG, PNG or WebP (`code: unsupported_type`), or can't be read (`code: unreadable_image`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description 10 uploads in the last hour; `Retry-After` says how many seconds until another is allowed */
                429: {
                    headers: {
                        "Retry-After"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        post?: never;
        /**
         * Remove the signed-in User's uploaded Profile picture
         * @description Deletes the uploaded photo. If it was the picture shown, the User shows initials. Needs a running Session and a verified email.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Removed, or there was no uploaded photo (nothing changes then) */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/profile-picture/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Choose what the signed-in User's Profile picture shows
         * @description Needs a running Session and a verified email.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        source: "uploaded" | "google" | "github" | "initials";
                    };
                };
            };
            responses: {
                /** @description The User, whose `avatarUrl` is the chosen picture's address (null for initials) */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["User"];
                    };
                };
                /** @description The option isn't available: no uploaded photo, a provider that isn't connected or sent no picture, or any other word (`code: source_unavailable`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/profile-pictures/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * An uploaded Profile picture
         * @description Public, for `<img>` tags, which send no access token; keys are unguessable and change with every upload, so a response may be cached for a year.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The photo */
                200: {
                    headers: {
                        "Cache-Control"?: string;
                        [name: string]: unknown;
                    };
                    content: {
                        "image/jpeg": string;
                    };
                };
                /** @description No photo has this key */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/linked-identities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The Google and GitHub accounts connected to the signed-in User
         * @description The User's Linked identities, Google first and then GitHub. The request must come from a session that is still running. The provider's own id for the person is never returned.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The Linked identities, empty when there are none */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["LinkedIdentityInfo"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/linked-identities/{provider}/link-ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A one-time ticket for connecting Google or GitHub
         * @description Returns a random ticket to pass as `link` on the full page load to `/api/auth/oauth2/{provider}`. It lasts 2 minutes, works once and is bound to the session that asked, to the provider and to the browser: the answer sets the cookie `link_binder`, which must come back on the callback. The session must have started within `nimbus.auth.link-recent-sign-in` (default 10 minutes) and be still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: "google" | "github";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The ticket */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ticket: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Not allowed: the sign-in is too old (`code: reauth_required`), or the User is Unverified (`code: email_unverified`) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Not a provider Nimbus knows, or one that is switched off */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The User has a Linked identity for the provider already (`code: already_connected`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/linked-identities/{provider}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Disconnect Google or GitHub from the signed-in User
         * @description Deletes the User's Linked identity for the provider and marks the provider as disconnected, so a later sign-in with it on the User's email is refused (`disconnected`) until it is connected again. Sessions are kept. No password is needed. The User is told by email afterwards. A provider that isn't linked also gives `204` and changes nothing. The request must come from a session that is still running.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    provider: "google" | "github";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The provider can no longer sign in as the User (or never could) */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description Not a provider Nimbus knows */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The User has no password and this is their only Linked identity (`code: last_sign_in_method`). Set a password first. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in User's running sessions
         * @description Every session of the User that can still be used: not signed out, before its 90-day cap, and used within the last 30 days. The session of this request comes first (`current`), the rest by `idleSeconds`, least first. The request must come from a session that is still running. The device is a label built from the browser's `User-Agent` ("Chrome on Windows", or "Unknown browser"); the header itself is never returned.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The sessions */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SessionInfo"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/sessions/sign-out-others": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign out every other session of the signed-in User
         * @description Ends every session of the User except the one of this request, without a password; their refresh tokens stop working. Their access tokens keep working for up to 15 minutes. Also `204` when there are no other sessions. Every remembered browser of the User asks for the Sign-in code again, except the one whose `two_step_remembered` cookie comes with this request. The request must come from a session that is still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Every other session is over */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/sessions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Sign out one of the signed-in User's sessions
         * @description Ends the session at once, without a password; its refresh tokens stop working. Its access tokens keep working for up to 15 minutes. Ending a session of the User that is already over also gives `204`, until the cleanup job deletes it (7 days after it ended). The request must come from a session that is still running.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The session is over */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description No session of the signed-in User has this id (unknown, not a UUID, or another User's) */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/two-step": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Whether the signed-in User has Two-step verification
         * @description The request must come from a session that is still running.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Its state */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["TwoStepStatus"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        /**
         * Turn on Two-step verification
         * @description Stores the setup the User just proved with `POST /api/users/me/two-step/setup/verify`: the authenticator key and the Recovery codes they were shown. Publishes `TwoStepEnabled`. Ends no session. The request must come from a session that is still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Two-step verification is on */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description No proved setup in progress (`code: setup_expired`: never verified, closed, expired after 10 minutes, or restarted), or Two-step verification is on already (`code: already_on`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        /**
         * Remove Two-step verification
         * @description Turns Two-step verification off after a Sign-in code from the User's authenticator app (one 30-second step either side of now, never a step already used) or one of their Recovery codes (capitals, spaces and dashes ignored). Deletes the authenticator key and every Recovery code, so a later setup starts fresh, and sign-ins stop asking for a code. Publishes `TwoStepDisabled`. Ends no session. The request must come from a session that is still running.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 123456 */
                        code?: string;
                        /** @example k7qx-2m9d */
                        recoveryCode?: string;
                    };
                };
            };
            responses: {
                /** @description Two-step verification is off */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The code is wrong, used already or isn't 6 digits, or the Recovery code is wrong or used (`code: invalid_code`, which counts toward the hourly lock), or a field is over 64 characters (`errors.code`, `errors.recoveryCode`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description Two-step verification is not on (`code: not_on`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/two-step/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start setting up Two-step verification
         * @description Makes a new authenticator key, replacing any setup in progress. Nothing is stored until the User turns it on; the setup lasts 10 minutes, in memory. The session must have started within `nimbus.auth.link-recent-sign-in` (default 10 minutes) and be still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The key, for typing, and the address the QR code holds */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /**
                             * @description Base32, 32 characters; the web app shows it in groups of four
                             * @example JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
                             */
                            key: string;
                            /** @example otpauth://totp/Nimbus:alice%40example.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Nimbus */
                            otpauthUri: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Not allowed: the sign-in is too old (`code: reauth_required`), or the User is Unverified (`code: email_unverified`) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description Two-step verification is on already (`code: already_on`), checked before the recent sign-in */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        /**
         * Throw away the setup in progress
         * @description The User closed the setup window: this session's setup in progress, proved or not, is thrown away, so it can't be turned on later. The request must come from a session that is still running.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Thrown away, or there was none */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/two-step/setup/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Prove the authenticator app has the key
         * @description Checks a Sign-in code against the key being set up (one 30-second step either side of now is accepted) and answers with the 10 Recovery codes the User must save. A setup that is proved already answers with the same codes, so a second tab or a double click never replaces them. Only the session that started the setup can prove it, and 5 wrong codes throw it away. Wrong codes also count toward the User's hourly lock on Sign-in codes. Turns nothing on. The request must come from a session that is still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 123456 */
                        code?: string;
                    };
                };
            };
            responses: {
                /** @description The Recovery codes, shown once */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            recoveryCodes: string[];
                        };
                    };
                };
                /** @description The code doesn't fit the key or isn't 6 digits (`code: invalid_code`), or it is over 64 characters (`errors.code`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description No setup in progress for this session (`code: setup_expired`): never started, started by another session, expired, discarded, replaced, or thrown away by this, the 5th wrong code */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/users/me/two-step/recovery-codes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * View new codes
         * @description Replaces the User's Recovery codes with a new set of 10, after a Sign-in code from their authenticator app (one 30-second step either side of now, never a step already used; a Recovery code is not accepted). The old set stops working at once and the new codes are shown only in this answer. Publishes `RecoveryCodesRegenerated`. The request must come from a session that is still running.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @example 123456 */
                        code?: string;
                    };
                };
            };
            responses: {
                /** @description The new Recovery codes, shown once */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            recoveryCodes: string[];
                        };
                    };
                };
                /** @description The code is wrong, used already or isn't 6 digits (`code: invalid_code`, which counts toward the hourly lock), or it is over 64 characters (`errors.code`) */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description Two-step verification is not on (`code: not_on`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                429: components["responses"]["TooManyAttempts"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The Permission catalog
         * @description Every Permission the modules declare, sorted by heading and key. Rebuilt from the code at every startup. Needs `access:role:manage`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The catalog */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            permissions: components["schemas"]["CatalogPermission"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/roles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Every Role
         * @description Platform roles first, built-in Roles in their usual order, then the rest by name. Needs `access:role:manage`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The Roles */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            roles: components["schemas"]["RoleSummary"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        /**
         * Create a custom Role
         * @description It starts with no Grants. Its key and kind can never change. Needs `access:role:manage`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["CreateRoleRequest"];
                };
            };
            responses: {
                /** @description The new Role */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Role"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                /** @description A Role with this key already exists (also under `errors.key`) */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/roles/{key}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * One Role with its Grants
         * @description Grants for Permissions no longer in the catalog are left out. Needs `access:role:manage`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The Role */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Role"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /**
         * Delete a custom Role nobody holds
         * @description Built-in Roles and Roles someone holds can't be deleted. Needs `access:role:manage`.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["RoleConflict"];
            };
        };
        options?: never;
        head?: never;
        /**
         * Rename or redescribe a Role
         * @description A missing name or description is left as it is. Sending `key` or `kind` is refused: they never change. Marks a built-in Role customised. Needs `access:role:manage`.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DescribeRoleRequest"];
                };
            };
            responses: {
                /** @description The updated Role */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Role"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["RoleConflict"];
            };
        };
        trace?: never;
    };
    "/api/access/roles/{key}/grants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Replace all of a Role's Grants
         * @description Each Grant must fit: a known Permission; in a project role a project permission with one of its allowed Scopes; in a platform role a platform permission without a Scope or a project permission with `all`; never a reserved Permission outside Platform admin; never twice. Marks a built-in Role customised. Needs `access:role:manage`.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["SaveGrantsRequest"];
                };
            };
            responses: {
                /** @description The Role with its new Grants */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Role"];
                    };
                };
                /** @description Some Grants don't fit; what is wrong per Permission key is under `errors` */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["RoleConflict"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/roles/{key}/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reset a built-in Role to its defaults
         * @description Restores its name, description and Grants and clears `customised`. Refused for Platform admin and when the Role changed since the given version. Needs `access:role:manage`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The version the Role was opened at */
                        version: number;
                    };
                };
            };
            responses: {
                /** @description The Role, back to its defaults */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Role"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
                /** @description A custom Role (no defaults), Platform admin (locked), or the Role changed since the version */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/roles/{key}/users": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                key: string;
            };
            cookie?: never;
        };
        /**
         * Who holds a platform role
         * @description Sorted by display name, then email. Everyone (held by every signed-in User) and project roles (given on a project's Members page) have no holders here. Needs `access:role:assign`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Its holders */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            users: components["schemas"]["RoleHolder"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["NoHoldersHere"];
            };
        };
        put?: never;
        /**
         * Give a platform role to a User by email
         * @description Finds the User by exact email (any case, surrounding whitespace ignored). Nobody gives themselves a Role. Recorded in the audit log. Needs `access:role:assign`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        email: string;
                    };
                };
            };
            responses: {
                /** @description The new holder */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RoleHolder"];
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                /** @description The User lacks `access:role:assign`, or the email is their own */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description No Role has this key, or no User has this email */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description They already hold it, haven't verified their email (only Google or GitHub sign-in proves it), or it is Everyone or a project role */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/roles/{key}/users/{userId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Take a platform role away from a User
         * @description Nobody takes their own Role away, and Platform admin is never taken from its last holder: the check runs under a lock, so two admins removing each other at once can't both succeed. Recorded in the audit log. Needs `access:role:assign`.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    key: string;
                    userId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Taken away */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description The User lacks `access:role:assign`, or it is their own assignment */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description No Role has this key, or the User doesn't hold it */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
                /** @description The last Platform admin, or Everyone or a project role */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": components["schemas"]["Problem"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The audit log, newest first
         * @description Every change to Roles and their Grants, and startup warnings about the catalog. Entries are never edited or deleted. Needs `access:audit:view`.
         */
        get: {
            parameters: {
                query?: {
                    page?: number;
                    size?: number;
                    /** @description The `asOf` of the first page; keeps later pages from shifting as new entries arrive */
                    asOf?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description One page of entries */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            entries: components["schemas"]["AuditEntry"][];
                            page: number;
                            size: number;
                            total: number;
                            /** @description The newest entry these pages cover; pass it back for the next pages */
                            asOf: number;
                        };
                    };
                };
                400: components["responses"]["InvalidFields"];
                401: components["responses"]["Unauthorized"];
                403: components["responses"]["Forbidden"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/access/me/permissions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the signed-in User may do across Nimbus and in a project
         * @description The signed-in User's platform permissions (from Everyone and their platform roles), sorted, so the web app can hide what they can't use. With `project`, also their widest Scope for each project permission they have in that project, from their project role there, their platform roles and Everyone. access doesn't know which projects exist, so any other id gets what platform roles and Everyone allow. The server checks every action anyway.
         */
        get: {
            parameters: {
                query?: {
                    /** @description The project's id (from `GET /api/projects/{key}`) */
                    project?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Their platform permissions, and their Scopes in the project when one was given */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /**
                             * @example [
                             *       "projects:project:create"
                             *     ]
                             */
                            platform: string[];
                            /**
                             * @description Only when `project` was given: project permission key to its widest Scope. Permissions the User lacks there are left out.
                             * @example {
                             *       "projects:project:update": "project",
                             *       "projects:member:manage": "project"
                             *     }
                             */
                            project?: {
                                [key: string]: "own" | "project" | "all";
                            };
                        };
                    };
                };
                /** @description `project` is not a UUID */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        CreateProjectRequest: {
            /** @description Stored uppercase; cannot be changed or reused */
            key: string;
            /** @description Trimmed, 1–100 Unicode code points, no ISO control characters; need not be unique */
            name: string;
            /** @description Optional plain text, cleaned at both ends like the name (whitespace, Unicode spaces, invisible format characters); none when nothing is left. Line breaks and tabs inside it are kept, other control characters rejected. */
            description?: string | null;
        };
        Project: {
            /** Format: uuid */
            id: string;
            key: string;
            name: string;
            description: string | null;
            archived: boolean;
            /** Format: date-time */
            createdAt: string;
        };
        /** @enum {string} */
        IssueNotificationType: "ISSUE_ASSIGNED" | "ISSUE_UNASSIGNED" | "ISSUE_STATUS_CHANGED" | "ISSUE_EDITED" | "ISSUE_DELETED";
        NotificationSetting: {
            type: components["schemas"]["IssueNotificationType"];
            email: boolean;
        };
        NotificationPage: {
            items: components["schemas"]["NotificationItem"][];
            /** @description Pass as before to fetch older Notifications; null at the end */
            nextCursor: string | null;
        };
        NotificationItem: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            type: "SIGNED_IN" | "PASSWORD_CHANGED" | "LINKED_IDENTITY_CONNECTED" | "LINKED_IDENTITY_DISCONNECTED" | "OTHER_SESSIONS_SIGNED_OUT";
            /** Format: date-time */
            createdAt: string;
            read: boolean;
            snapshot: {
                /** @example New sign-in to your account */
                title: string;
                /**
                 * @description Only for SIGNED_IN
                 * @example Safari on iPhone
                 */
                deviceLabel?: string;
                /**
                 * @description The line under the title for every other type
                 * @example If this wasn't you, reset it now.
                 */
                detail?: string;
            };
            /** @constant */
            link: "/settings/security";
        };
        RegisterRequest: {
            /** @description Surrounding whitespace (no-break and other Unicode spaces included) is removed; at least one visible character; at most 100 characters (an emoji counts as one); no control, line-separator, private-use or invisible format characters (zero-width space, word joiner, byte order mark, soft hyphen), no bidirectional marks, overrides or isolates, and no combining grapheme joiner. U+200D and U+200C are allowed only between two visible characters (emoji sequences, Persian and Indic scripts). Tag characters are allowed only in a flag sequence, variation selectors only after emoji, keycaps and Han characters, and at most 5 combining marks may stack on one character */
            displayName: string;
            /**
             * Format: email
             * @description Case-insensitive; stored lower-cased
             */
            email: string;
            password: string;
        };
        UpdateProfileRequest: {
            /** @description Same rule as at registration. Surrounding whitespace (no-break and other Unicode spaces included) is removed; at least one visible character; at most 100 characters (an emoji counts as one); no control, line-separator, private-use or invisible format characters (zero-width space, word joiner, byte order mark, soft hyphen), no bidirectional marks, overrides or isolates, and no combining grapheme joiner. U+200D and U+200C are allowed only between two visible characters (emoji sequences, Persian and Indic scripts). Tag characters are allowed only in a flag sequence, variation selectors only after emoji, keycaps and Han characters, and at most 5 combining marks may stack on one character */
            displayName: string;
        };
        ChangePasswordRequest: {
            /** @description Required when the User has a password (`400` with `errors.currentPassword` if missing or wrong) */
            currentPassword?: string;
            /** @description Same rules as at registration; kept exactly as typed */
            newPassword: string;
        };
        LoginRequest: {
            /** @description Case-insensitive */
            email: string;
            password: string;
        };
        /** @description What a sign-in or connect in the system browser handed back to the Desktop app (ADR 0008). */
        DesktopCode: {
            /** @description The one-time code from `http://127.0.0.1:<port>/<nonce>?code=` */
            code: string;
            /** @description The secret the app made for this attempt (43-128 characters); the handshake was started with its hash */
            verifier: string;
        };
        AuthResponse: {
            /** @description HS256 JWT, valid 15 minutes. Keep it in memory only. */
            accessToken: string;
            user: components["schemas"]["User"];
        };
        User: {
            /** Format: uuid */
            id: string;
            /** Format: email */
            email: string;
            displayName: string;
            /**
             * Format: uri-reference
             * @description The Profile picture the User shows: their uploaded photo (by default an address under `/api/profile-pictures/`), or the picture their last Google or GitHub sign-in brought; null for initials
             */
            avatarUrl: string | null;
            /** @description False for Users who only sign in with Google or GitHub; the app asks for a current password only when true */
            hasPassword: boolean;
            /** @description False until the User has entered the emailed code or signed in with Google or GitHub on the email. An Unverified User gets `403` with `code` `email_unverified` from every endpoint except `GET /api/users/me` and those under `/api/auth/`. */
            emailVerified: boolean;
            /**
             * Format: date-time
             * @description When the password was last set (sign-up, change, first password, forgot password). Null without a password, and for passwords set before Nimbus kept the time.
             */
            passwordChangedAt: string | null;
            /** @description Whether the User has an uploaded photo, whether or not it is the picture shown */
            hasUploadedPicture: boolean;
            /**
             * @description What the User shows. Null for a picture from before Linked identities kept their own, which belongs to none of the options.
             * @enum {string|null}
             */
            pictureSource: "uploaded" | "google" | "github" | "initials" | null;
            /** @description What the User may pick from with `PUT /api/users/me/profile-picture/source` */
            pictureOptions: {
                /** Format: date-time */
                uploadedAt: string | null;
                /**
                 * Format: uri-reference
                 * @description The uploaded photo's address, shown or not; null without an upload
                 */
                uploadedUrl: string | null;
                /** @description Each connected provider that sent a picture, Google first */
                providers: {
                    /** @enum {string} */
                    provider: "google" | "github";
                    /** Format: uri */
                    pictureUrl: string;
                    /** @description The Google email or the GitHub username */
                    label: string;
                }[];
            };
        };
        SessionInfo: {
            /** Format: uuid */
            id: string;
            /**
             * @description Browser and system, e.g. "Chrome on Windows"; "Unknown browser" when the header was missing or not recognised
             * @example Chrome on Windows
             */
            device: string;
            /** @description True for the session the request came from */
            current: boolean;
            /** Format: date-time */
            startedAt: string;
            /** @description How many seconds ago this session last got a new refresh token, by the server's clock, so a wrong clock on the viewer's computer can't skew it. Accurate to about 15 minutes. */
            idleSeconds: number;
        };
        LinkedIdentityInfo: {
            /** @enum {string} */
            provider: "google" | "github";
            /**
             * @description The Google email or the GitHub username, refreshed on every sign-in with that provider. Null for an identity linked before names were kept, until its next sign-in.
             * @example udula@gmail.com
             */
            accountName: string | null;
            /** Format: date-time */
            connectedAt: string;
        };
        TwoStepStatus: {
            enabled: boolean;
            /**
             * Format: date-time
             * @description When it was turned on; null when off
             */
            enabledAt: string | null;
            /**
             * @description Recovery codes not used yet; null when off
             * @example 10
             */
            recoveryCodesLeft: number | null;
        };
        CatalogPermission: {
            /**
             * @description `module:resource:action`
             * @example projects:project:update
             */
            key: string;
            /**
             * @description The module heading the Roles page groups it under
             * @example Projects
             */
            heading: string;
            description: string;
            /**
             * @description A platform permission is granted in platform roles, without a Scope. A project permission is granted in project roles with one of `scopes`, and in platform roles only with `all`.
             * @enum {string}
             */
            kind: "platform" | "project";
            /** @description The Scopes it may have in project roles; empty for platform permissions and for project permissions only platform roles hold */
            scopes: ("own" | "project")[];
            /** @description What Scope Own means for it; null when Own isn't allowed */
            ownHint: string | null;
            /** @description Only Platform admin may hold it */
            reserved: boolean;
        };
        RoleSummary: {
            /** @example project_admin */
            key: string;
            name: string;
            description: string;
            /** @enum {string} */
            kind: "platform" | "project";
            builtIn: boolean;
            /** @description A built-in Role an admin changed; startup no longer resets it to the code defaults */
            customised: boolean;
            /** @description How many Permissions it grants */
            permissions: number;
            /** @description How many Role assignments it has; null for Everyone, which every signed-in User holds */
            holders: number | null;
        };
        Role: {
            key: string;
            name: string;
            description: string;
            /** @enum {string} */
            kind: "platform" | "project";
            builtIn: boolean;
            customised: boolean;
            /** @description Nothing about it can be edited (Platform admin) */
            locked: boolean;
            /** @description Changes on every edit; edits must send the version they started from */
            version: number;
            grants: (components["schemas"]["Grant"] & {
                /** @description The Role must always hold it */
                locked: boolean;
            })[];
            holders: number | null;
            /** @description For a customised built-in Role, its defaults it lacks that appeared after it was customised */
            newPermissions: string[];
        };
        Grant: {
            permission: string;
            /**
             * @description Null for platform permissions
             * @enum {string|null}
             */
            scope: "own" | "project" | "all" | null;
        };
        /** @description A User holding a platform role */
        RoleHolder: {
            /** Format: uuid */
            id: string;
            /** @description Null, like the name, for a User who no longer exists */
            email: string | null;
            displayName: string | null;
            avatarUrl: string | null;
            /**
             * Format: date-time
             * @description When they were given the Role
             */
            since: string;
        };
        AuditEntry: {
            /** Format: uuid */
            id: string;
            /** Format: date-time */
            at: string;
            /** @description Who did it; null when the system did. Name and email are null for a User who no longer exists. */
            actor: null | {
                /** Format: uuid */
                id: string;
                displayName: string | null;
                email: string | null;
                /** @description The picture they show; null without one or for a User who no longer exists */
                avatarUrl: string | null;
            };
            /** @enum {string} */
            action: "role.created" | "role.renamed" | "role.described" | "role.grants_changed" | "role.reset" | "role.deleted" | "role.assigned" | "role.unassigned" | "role.defaults_applied" | "role.locked_grants_restored" | "catalog.unknown_grant" | "catalog.unknown_grant_resolved";
            target: {
                /** @enum {string} */
                type: "role";
                key: string;
                /** @description Whether the Role still exists */
                exists: boolean;
            };
            /** @description The state before the change; null when there was none */
            before: {
                [key: string]: unknown;
            } | null;
            /** @description The state after the change; null when there is none */
            after: {
                [key: string]: unknown;
            } | null;
        };
        CreateRoleRequest: {
            /** @description Fixed forever */
            key: string;
            /** @description Surrounding whitespace is removed first */
            name: string;
            description?: string;
            /**
             * @description Fixed forever
             * @enum {string}
             */
            kind: "platform" | "project";
        };
        DescribeRoleRequest: {
            name?: string;
            description?: string;
            /** @description The version the Role was opened at */
            version: number;
        };
        SaveGrantsRequest: {
            grants: components["schemas"]["Grant"][];
            /** @description The version the Role was opened at */
            version: number;
        };
        /** @description RFC 9457 problem details */
        Problem: {
            type?: string;
            title?: string;
            status?: number;
            detail?: string;
            instance?: string;
            /** @description A machine-readable reason where the status alone isn't enough, e.g. `email_unverified` (403), `invalid_code` or `code_expired` (400), `last_sign_in_method` or `already_connected` (409), `reauth_required` (403) */
            code?: string;
        };
    };
    responses: {
        /** @description Some fields are invalid */
        InvalidFields: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"] & {
                    /** @description Message per invalid field */
                    errors?: {
                        [key: string]: string;
                    };
                };
            };
        };
        /** @description Rate limited (failed sign-ins per email or IP address, registrations, refreshes, forgot-password requests or reset attempts per IP address, wrong current passwords per User, or wrong Sign-in codes per User) */
        TooManyAttempts: {
            headers: {
                /** @description Seconds until another attempt may succeed */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Missing, expired or invalid access token */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content?: never;
        };
        /** @description The User lacks the Permission this needs */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Nothing with this key exists */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description The Role changed since the given version, it is locked (Platform admin, or a Grant it must keep), it is built in (delete), or someone holds it (delete) */
        RoleConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description Everyone (held by every signed-in User) or a project role (given on a project's Members page) */
        NoHoldersHere: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description A ticket from `POST /api/users/me/linked-identities/{provider}/link-ticket`. With it the handshake connects the provider account to that ticket's User instead of signing anyone in: no session, no refresh cookie. It ends at `/settings/security?connected=<provider>`, or `/settings/security?error=<code>&provider=<provider>` with `already_linked`, `already_connected`, `email_unverified`, `cancelled`, `failed` or `expired`. */
        LinkTicket: string;
        /** @description The Desktop app only (ADR 0008): base64url SHA-256 of the app's verifier (RFC 7636 S256, 43 characters). Together with `port` and `nonce` it makes the handshake end at the app's port on `127.0.0.1` with a one-time code instead of signing the browser in. When any of the three is missing or malformed, the handshake ends in the browser as usual. */
        DesktopChallenge: string;
        /** @description The Desktop app's port on `127.0.0.1`, which the browser takes the result to. The host is never taken from the request. */
        DesktopPort: number;
        /** @description The random path of this attempt on the Desktop app's port. */
        DesktopNonce: string;
        /** @description The page to land on after signing in, e.g. `/projects/42`. Kept in the handshake's session (never sent to the provider) and passed back as `returnTo` on the redirect that ends the handshake. Ignored unless it is a path inside the app: one leading `/`, not `/` alone, no control characters, at most 2048 characters. */
        ReturnTo: string;
    };
    requestBodies: never;
    headers: {
        /** @description Starts or rotates the session: `refresh_token=<opaque>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=<seconds until it expires>`. Expires 30 days after issue, and never later than 90 days after sign-in. */
        RefreshCookie: string;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
