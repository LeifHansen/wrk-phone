# App Store + Google Play submission checklist

End-to-end runbook for getting WrkPhn into both stores. Items marked **[DONE]** are already handled in this repo; everything else needs you to do something (sign in somewhere, paste a value, take a screenshot).

Order matters — top to bottom. Skipping ahead breaks `eas submit`.

---

## Phase 0 — Accounts you must have

| Account | Cost | What you need from it |
|---|---|---|
| Apple Developer Program | $99/yr | Team ID, ASC API key |
| App Store Connect | included | App record, app metadata, screenshots, testers |
| Google Play Console | $25 one-time | App record, service-account JSON |
| Expo account | free | EAS Build + Submit (`eas login`) |

**[DONE]** Apple Team ID `637678XV8Y`, ASC API key ID `5Z29P6C3YN`, issuer `41b160e9-71e4-4c24-b04f-a7950f2c2c2c`, key file at `~/Downloads/AuthKey_5Z29P6C3YN.p8`.

---

## Phase 1 — Apple Developer Portal (manual, ~5 min)

1. **Register the Bundle ID** — go to <https://developer.apple.com/account/resources/identifiers/list> → **+** → App IDs → App
   - Description: `WrkPhn`
   - Bundle ID: `com.wrkphn.app` (Explicit)
   - Capabilities to check: **Push Notifications**, **VoIP** (under Background Modes — already in app.json but Apple still needs the cap), **Associated Domains** (optional, only if you wire universal links later)
   - Save.

2. **Generate an APNs Auth Key** (for VoIP push) — Apple Developer → **Keys** → **+** → name "WrkPhn VoIP", check **Apple Push Notifications service (APNs)** → Continue → Register → **Download** the `.p8` (you can only download once). Save the **Key ID** and your Team ID.

3. **(Optional) Push Voice Credential in Twilio** — Twilio Console → Voice → Credentials → Push Credentials → Create iOS Push Credential → paste APNs key. Result is a `CR…` SID; put it in `server/.env` as `TWILIO_PUSH_CREDENTIAL_SID_IOS` and `fly secrets set` for prod.

---

## Phase 2 — App Store Connect (manual, ~10 min)

1. Go to <https://appstoreconnect.apple.com/apps> → **+** → **New App**
   - Platforms: **iOS**
   - Name: **WrkPhn** (must be unique across the App Store globally; if taken, try "WrkPhn — AI Work Phone")
   - Primary language: **English (U.S.)**
   - Bundle ID: pick `com.wrkphn.app` (will only appear after Phase 1 step 1)
   - SKU: `wrkphn-ios-001`
   - User Access: Full Access
   - Create.

2. **Copy the App ID** from the URL: `appstoreconnect.apple.com/apps/<APP_ID>/...` — it's a 10-digit number. **Paste it into `mobile/eas.json` → `submit.production.ios.ascAppId`** (replace `PENDING_CREATE_IN_APP_STORE_CONNECT`).

3. **App Information** (sidebar):
   - Subtitle: *AI work phone & SMS agent* (30-char max)
   - Category: **Primary: Business**, Secondary: **Productivity**
   - Privacy Policy URL: `https://wrkphn.com/privacy` **[DONE]** — live
   - Marketing URL (optional): `https://wrkphn.com/`
   - Support URL: `https://wrkphn.com/` (or set up `support@wrkphn.com` later)

4. **Pricing and Availability**: Free, all territories (or restrict to US for v1 to avoid TCPA-equivalent compliance in other markets).

5. **App Privacy** (sidebar): use the draft below ("App Privacy questionnaire") — these answers must match the `PrivacyInfo.xcprivacy` we ship.

6. **Age Rating**: Business / Productivity → all 17+ triggers off → expect **4+**. Honest answers will produce 4+ for an SMS/voice business app.

---

## Phase 3 — EAS Build + Submit (CLI, ~30 min total)

```bash
cd ~/Desktop/WrkPhn/mobile
npx eas login                       # one-time
npx eas build --platform ios --profile production
# answer 'yes' to letting EAS manage credentials — uses your ASC API key
# build runs on EAS servers (~15-25 min). Resulting .ipa lives on expo.dev.

npx eas submit --platform ios --profile production
# submits the latest production build to TestFlight automatically.
```

Once it lands in App Store Connect (5-15 min after submit completes):
- **TestFlight** tab → add yourself (`layfansun@gmail.com`) under Internal Testing → install via the TestFlight app on your iPhone.
- Verify push notifications + calls work on a real device.

---

## Phase 4 — App Store listing content (manual data entry in ASC)

Fill these on the version's submission page. Drafts below — tweak to taste.

### Promotional text (170 chars, can be updated without app review)
> AI text and voice agents reply for you 24/7. SMS marketing built in. Set it up in minutes — your work phone runs itself.

### Description (4,000 char max)
> **WrkPhn is the AI work phone for small business.**
>
> Stop missing calls. Stop drowning in customer texts. WrkPhn answers both with AI that sounds like you — and runs your SMS marketing on the same line.
>
> **AI text agents** read every incoming SMS and reply in your voice. Suggest mode queues a reply for approval; autopilot mode sends safely on its own. Each agent has a tone, a set of rules, and example replies you train in 60 seconds.
>
> **AI voice agents** answer your business calls 24/7. Custom greeting, natural voice, message capture, voicemail transcription — everything goes straight to your inbox.
>
> **SMS marketing campaigns** to your full contact list, a segment, or a one-off paste. Personalization with first-name tokens, MMS images, throttle-aware delivery, full per-recipient status. Built-in STOP/HELP and opt-out tracking keep you compliant.
>
> **One business number, one shared inbox** — your texts, calls, voicemails, and AI-handled threads in one place. Browser + iPhone + Android.
>
> **Why WrkPhn:**
> • AI text and voice agents trained in minutes
> • One business number — separate from your personal line
> • SMS / MMS campaigns with first-name personalization
> • Templates for one-off sends
> • Real Twilio-grade delivery with status tracking
> • Carrier compliance (STOP / HELP / 10DLC) handled
> • Pay-as-you-go credits — no contract, no setup fees
>
> Visit wrkphn.com to learn more. By using WrkPhn you agree to our Terms of Service (wrkphn.com/terms) and Privacy Policy (wrkphn.com/privacy).

### Keywords (100 char max, comma-separated)
```
ai sms,sms marketing,ai phone,ai agent,work phone,business sms,sms blast,text marketing,voice ai,texting
```

### What's New in This Version (4,000 char)
> First release. AI text + voice agents, SMS marketing campaigns, shared inbox, one business number.

### Support contact
- Email: `support@wrkphn.com` (or your personal email until you wire that mailbox)
- URL: `https://wrkphn.com/`

### Copyright
- `© 2026 WrkPhn`

### App Review Information
- **Sign-in required**: yes, **Demo account** = create one fresh with a throwaway address before submitting; put creds here.
- **Notes for reviewer**:
> WrkPhn is a Twilio-powered SMS + voice app for businesses. All messaging and calling routes through a server-side Twilio account; the iOS app talks to wrkphn.com over HTTPS. The demo account above includes a shared toll-free number you can text and call to verify functionality. AI agent replies are powered by OpenAI's API; voice synthesis by ElevenLabs.

---

## Phase 5 — App Privacy questionnaire (verbatim answers)

Match the shipped `PrivacyInfo.xcprivacy`. Each row: "Yes, we collect" → "Linked to user" → "Not used for tracking" → purposes.

| Data type | Collected | Linked | Tracking | Purposes |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality, Authentication |
| Phone Number | Yes | Yes | No | App Functionality |
| Contacts | Yes | Yes | No | App Functionality |
| User Content > Audio Data | Yes | Yes | No | App Functionality |
| User Content > Other User Content | Yes | Yes | No | App Functionality |
| Diagnostics > Crash Data | Yes | No | No | App Functionality, Analytics |

Everything else: **No**. Don't check "Health", "Financial Info" (Stripe handles cards on their side — we never see them), "Sensitive Info", "Search History", "Browsing History", or "Identifiers > Advertising".

---

## Phase 6 — Screenshots (manual — your phone or a simulator)

Apple requires at least one set; you can upload up to 10 per size. The required sizes for new submissions:

| Device | Size | How to get it |
|---|---|---|
| **6.7" iPhone** (iPhone 15 Pro Max / 16 Pro Max) | 1290 × 2796 | Real device → Cmd-Shift-S in Simulator → "iPhone 16 Pro Max" |
| **6.5" iPhone** (iPhone 11 Pro Max) | 1242 × 2688 | Simulator → "iPhone 11 Pro Max" |
| **iPad Pro 12.9" (2nd gen+)** | 2048 × 2732 | Only required if you support iPad — we set `supportsTablet: false`, so SKIP. |

Suggested 5 screenshots in order:
1. Landing/Phone tab with the keypad — caption: *Your work number, ready to call or text.*
2. Inbox showing 3-4 threads — caption: *All your texts in one shared inbox.*
3. Conversation view with an AI suggestion bubble visible — caption: *AI drafts the reply. You approve.*
4. Campaigns "New" form with a sample blast composed — caption: *SMS marketing without the busywork.*
5. Agent detail screen (with persona/instructions filled) — caption: *Train an AI agent in two minutes.*

Use the demo account so screenshots show real-looking data, not your private threads.

---

## Phase 7 — Google Play (parallel track, similar effort)

1. Create the app in **Play Console** → All apps → Create app
   - App name: `WrkPhn`
   - Default language: `English (United States)`
   - App or game: App
   - Free / Paid: Free
   - Confirm the developer declarations.

2. **Set up a service account** in Google Cloud Console (Play Console → Setup → API access → "Create new service account"), grant it "Release manager" role in Play Console, download the JSON, save as `mobile/play-service-account.json` (gitignored).

3. Build + submit:
```bash
npx eas build --platform android --profile production
npx eas submit --platform android --profile production
```

4. Required Play listing fields:
   - Short description (80 chars): `AI work phone — AI text & voice agents, SMS marketing on one business line.`
   - Full description: reuse the iOS one above
   - **Graphic assets**: Feature graphic 1024×500, screenshots (2–8 per device type), high-res icon 512×512 (Play converts your 1024 automatically — but provide explicitly if rejected)
   - Category: **Business**
   - Tags: SMS, business, productivity
   - Content rating questionnaire (similar to Apple's): same answers — Business app, 0-13+
   - Data safety form: mirror the Apple App Privacy table above

---

## Phase 8 — Things to do BEFORE pressing Submit for Review

- [ ] **Bundle ID is registered** in Apple Developer Portal (Phase 1.1)
- [ ] **App created in App Store Connect** + `ascAppId` pasted into `eas.json` (Phase 2.1-2.2)
- [ ] **Privacy Policy URL** set in App Information → resolves to a real page (already does — `wrkphn.com/privacy` returns 200)
- [ ] **App Privacy questionnaire** filled (Phase 5)
- [ ] **At least one TestFlight build** processed successfully and installed on your phone
- [ ] **All 5+ screenshots uploaded** for the 6.7" size (Phase 6)
- [ ] **Demo account creds** in App Review Information (Phase 4 → App Review Information)
- [ ] **Test on a real device with airplane mode off** — make one call, send one text, receive one inbound. Apple reviewers WILL test this.
- [ ] **Increment `buildNumber`** in `app.json` for every resubmission (EAS does this automatically with `autoIncrement: true`)

---

## Files this repo ships [DONE]

| File | What it covers |
|---|---|
| `mobile/app.json` | iOS + Android manifest, permission strings, bundle ID, version, splash, icon, ITSAppUsesNonExemptEncryption=false |
| `mobile/eas.json` | Build profiles (development / preview / production) + submit profile with Apple Team ID + Apple ID baked in |
| `mobile/PrivacyInfo.xcprivacy` | iOS Privacy Manifest — required for new submissions since Spring 2024. Mirrors the App Privacy answers in Phase 5. |
| `mobile/assets/icon.png` | 1024×1024 RGB no-alpha — passes Apple's icon validation |
| `https://wrkphn.com/privacy` | Privacy Policy (referenced in the listing) |
| `https://wrkphn.com/terms` | Terms of Service (referenced from in-app + privacy page) |

## Common rejection reasons (avoid these)

1. **5.1.1 — Privacy mismatch**: in-app data behavior must match the Privacy Manifest AND the App Privacy questionnaire. If you collect anything not declared, you get rejected. Re-check after every feature add.
2. **4.0 — Spam / minimum functionality**: if reviewer can't easily test the app (e.g. no demo account, or paid-only entry), they reject. Always provide a working demo account.
3. **5.4 — VoIP misuse**: if the app declares `voip` background mode but doesn't actually do VoIP, rejected. WrkPhn legitimately does VoIP via Twilio — fine.
4. **5.2.1 — Acceptable Use (telephony)**: messaging apps catch extra scrutiny. The TCPA compliance language in our Terms of Service + the in-app consent gates on agent calls help here.

---

## Quick reference — typical day-to-day commands

```bash
# Login (one time)
npx eas login

# Build a fresh production iOS .ipa
cd ~/Desktop/WrkPhn/mobile
npx eas build --platform ios --profile production

# Submit the most recent build to App Store Connect
npx eas submit --platform ios --profile production

# Quick TestFlight build (skips App Store submission, internal-only)
npx eas build --platform ios --profile preview

# Watch a running build
npx eas build:list --limit 5
```
