import { MarketingLayout } from '../components/MarketingLayout';
import { useSeo } from '../lib/seo';

const URL = 'https://wrkphn.com/privacy';
const EFFECTIVE = 'May 24, 2026';

export function PrivacyPolicy() {
  useSeo({
    title: 'Privacy Policy | WrkPhn',
    description: 'WrkPhn Privacy Policy — what data we collect, how we use it, how we share it, and your rights.',
    canonical: URL,
  });
  return (
    <MarketingLayout>
      <article className="lp-section" style={{ maxWidth: 820 }}>
        <h1>Privacy Policy</h1>
        <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Effective: {EFFECTIVE}</p>

        <p>
          This Privacy Policy explains what WrkPhn collects, how we use it, and what choices you
          have. By using WrkPhn you agree to this Policy. This Policy is not legal advice.
        </p>

        <h2>1. Who we are</h2>
        <p>
          WrkPhn (<a href="https://wrkphn.com">wrkphn.com</a>) operates the WrkPhn AI work-phone
          platform — AI text agents, AI voice agents, SMS/MMS sending, voice calling, contact
          management, campaign tooling, templates, and a media library.
        </p>

        <h2>2. What we collect</h2>
        <p>We collect only what's needed to run the Service. Specifically:</p>
        <h3>2.1 Account data</h3>
        <ul>
          <li>Email address and a salted, hashed password (we never store your password in cleartext).</li>
          <li>Account preferences, time zone, avatar (if uploaded), and onboarding state.</li>
          <li>Billing data handled by <b>Stripe</b> on our behalf — we do not store full card numbers.</li>
        </ul>
        <h3>2.2 Telephony data</h3>
        <ul>
          <li>Phone numbers provisioned to you (Twilio).</li>
          <li>Messages you send and receive, plus delivery status and any media you attach.</li>
          <li>Calls you place and receive (start/end time, duration, status). We <b>do not</b>
            record call audio by default; voicemail recordings are stored when a caller leaves one
            and are transcribed for your inbox.</li>
          <li>Contacts you create, import, or sync: name, phone, and any segment memberships.</li>
          <li>Opt-out records (SMS and voice) and TCPA consent acknowledgement metadata
            (timestamp, IP, user-agent) for agent-call campaigns.</li>
        </ul>
        <h3>2.3 AI and agent data</h3>
        <ul>
          <li>Agent configuration you create (persona, instructions, examples, rules, voice).</li>
          <li>Voice samples you upload for cloning, if you use that feature.</li>
          <li>Prompts you send to the AI image generator and the resulting images.</li>
          <li>Inputs and outputs sent to OpenAI (and ElevenLabs, when configured) to generate
            agent replies, call scripts, transcriptions, and voice synthesis.</li>
        </ul>
        <h3>2.4 Technical data</h3>
        <ul>
          <li>Standard request logs: IP address, user-agent, request path, status, timing — kept
            for security and debugging.</li>
          <li>Google Analytics events (page views, basic interaction) on marketing and in-app
            pages. Analytics data is pseudonymous by default; we do not pass personal identifiers
            to it. You can block analytics by using a tracking-protection browser extension.</li>
          <li>Cookies and similar storage: a session token (after login), preferences, and the
            analytics IDs above.</li>
        </ul>

        <h2>3. How we use it</h2>
        <ul>
          <li>To operate the Service: route messages, place calls, run AI agents, render
            templates, charge for usage, and surface data in your inbox.</li>
          <li>To ensure compliance: enforce STOP/HELP opt-outs, maintain audit trails of agent-call
            consent, and respond to carrier and regulator inquiries.</li>
          <li>To improve the Service: aggregate usage statistics and crash diagnostics. We
            do <b>not</b> use your Content to train AI models.</li>
          <li>To communicate with you about your account, billing, security, or product changes.</li>
          <li>To prevent fraud and abuse.</li>
        </ul>

        <h2>4. Sub-processors we share data with</h2>
        <p>We use these vendors to deliver the Service. Each handles only the data needed for its function.</p>
        <ul>
          <li><b>Twilio</b> — telephony (SMS/MMS, voice, transcription, machine detection).</li>
          <li><b>OpenAI</b> — LLM for agent replies, image generation, training prompt drafting,
            optimization, and the SMS-deliverability lint. Per OpenAI's API terms, API content is not
            used to train OpenAI's models by default.</li>
          <li><b>ElevenLabs</b> — voice cloning, when enabled by the account owner.</li>
          <li><b>Stripe</b> — payment processing (cards, billing portal).</li>
          <li><b>Cloudflare</b> — DNS, edge proxying, and (when configured) R2 object storage for
            media files.</li>
          <li><b>Fly.io</b> — application hosting and persistent storage.</li>
          <li><b>Google Analytics</b> — pseudonymous web analytics.</li>
        </ul>
        <p>We do not sell your personal information.</p>

        <h2>5. Data retention</h2>
        <ul>
          <li>Messages, conversations, and call logs are retained as long as your account is active.</li>
          <li>Voice samples you upload are retained until you delete the voice or your account.</li>
          <li>Request logs are retained for up to 90 days, then rotated out.</li>
          <li>On account termination, we delete or anonymize your account data within 30 days,
            except where law requires longer retention (billing records, TCPA consent logs).</li>
        </ul>

        <h2>6. Your rights</h2>
        <p>
          You may access, correct, export, or delete your data from inside the app, or by emailing
          us. Residents of California, the EU/EEA, the UK, and similar jurisdictions have specific
          rights under their local laws (e.g. CCPA, GDPR) — we will honor those rights on request.
        </p>
        <ul>
          <li><b>Access / export:</b> we will provide your data in a portable format on request.</li>
          <li><b>Delete:</b> request account deletion at any time.</li>
          <li><b>Opt out of analytics:</b> use a browser tracking-blocker or send us a request.</li>
        </ul>
        <p>
          Contact us at <a href="mailto:privacy@wrkphn.com">privacy@wrkphn.com</a> to exercise these
          rights.
        </p>

        <h2>7. Security</h2>
        <p>
          Data is encrypted in transit (TLS) and at rest on our hosting provider. Passwords are
          hashed with a salted one-way function. Webhook calls from Twilio and Stripe are signature-
          verified. Access to production systems is limited to authorized personnel. No system is
          perfectly secure; we cannot guarantee absolute protection against a determined attacker.
        </p>

        <h2>8. Children</h2>
        <p>
          The Service is not directed to anyone under 18. We do not knowingly collect personal
          information from people under 18. If you believe we have, contact us and we will delete it.
        </p>

        <h2>9. International transfers</h2>
        <p>
          The Service is operated from the United States. If you access it from outside the US, your
          data will be transferred to and processed in the US, where data-protection laws may
          differ from those in your country.
        </p>

        <h2>10. Recipient data (contacts you import)</h2>
        <p>
          When you upload, sync, or paste contact phone numbers, you confirm that you have a lawful
          basis to do so and that you will only message those contacts in ways permitted by law and
          by their consent. We process recipient data on your behalf as a service provider. You are
          the controller for your contact list. If you receive a deletion request from one of your
          contacts, you must honor it within your account; we will assist on request.
        </p>

        <h2>11. Changes to this Policy</h2>
        <p>
          We may update this Policy. When we do, we update the "Effective" date and (for material
          changes) notify you in-product or by email. Continued use means acceptance.
        </p>

        <h2>12. Contact</h2>
        <p>
          Privacy questions: <a href="mailto:privacy@wrkphn.com">privacy@wrkphn.com</a>.<br />
          General support: <a href="mailto:support@wrkphn.com">support@wrkphn.com</a>.
        </p>
      </article>
    </MarketingLayout>
  );
}
