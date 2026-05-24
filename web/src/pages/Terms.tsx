import { MarketingLayout } from '../components/MarketingLayout';
import { useSeo } from '../lib/seo';

const URL = 'https://wrkphn.com/terms';
const EFFECTIVE = 'May 24, 2026';

export function Terms() {
  useSeo({
    title: 'Terms of Service | WrkPhn',
    description: 'WrkPhn Terms of Service — eligibility, acceptable use, telephony compliance, billing, and liability.',
    canonical: URL,
  });
  return (
    <MarketingLayout>
      <article className="lp-section" style={{ maxWidth: 820 }}>
        <h1>Terms of Service</h1>
        <p style={{ color: 'var(--muted)', fontWeight: 600 }}>Effective: {EFFECTIVE}</p>

        <p style={{ background: 'var(--yellow)', border: 'var(--border)', borderRadius: 8, padding: 14, marginTop: 14 }}>
          <b>Important:</b> these Terms govern your use of WrkPhn. By creating an account or using the
          Service, you agree to be bound by them. If you do not agree, do not use the Service. These
          Terms are not legal advice; you are responsible for your own legal compliance.
        </p>

        <h2>1. Definitions</h2>
        <p>
          "<b>WrkPhn</b>," "<b>we</b>," "<b>us</b>" refer to WrkPhn (the operator of <a href="https://wrkphn.com">wrkphn.com</a>
          and related apps). "<b>Service</b>" means the WrkPhn platform: AI text agents, AI voice agents,
          SMS / MMS sending, voice calling, contact management, campaign tooling, templates, media
          library, and any related features. "<b>You</b>" or "<b>User</b>" means the person or entity using
          the Service. "<b>Content</b>" means any text, message, recording, image, audio sample, contact
          data, or other material you create, upload, send, receive, or store through the Service.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be at least 18 years old and able to form a binding contract under applicable
          law. By using the Service you represent that you are. The Service is intended for business
          and professional use; consumer or unrelated personal use is not its purpose. You may not
          use the Service if you are barred from doing so under any applicable law (including
          export-control or sanctions regimes).
        </p>

        <h2>3. Your account</h2>
        <p>
          You are responsible for everything that happens under your account, including all activity
          by anyone you authorize. Keep your credentials confidential. Notify us immediately if you
          suspect unauthorized access. We are not liable for losses caused by you failing to
          safeguard your account.
        </p>

        <h2>4. Acceptable use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Send any message or place any call that violates applicable law, including the
            Telephone Consumer Protection Act (TCPA), the CAN-SPAM Act, state telemarketing laws,
            the Telecommunications Consumer Protection Regulations (Canada), or any equivalent
            non-US law.</li>
          <li>Send unsolicited commercial messages to recipients who have not provided <b>prior
            express written consent</b> (for automated voice or automated SMS marketing) or who
            have opted out via STOP, "remove me," voicemail keypress, or any equivalent.</li>
          <li>Impersonate any person or entity, or misrepresent your affiliation with anyone.</li>
          <li>Send messages or place calls that are harassing, threatening, defamatory, fraudulent,
            obscene, or unlawful.</li>
          <li>Upload, clone, or use a voice sample that is not your own and that you do not have
            documented permission to use.</li>
          <li>Transmit content that infringes intellectual-property, trade-secret, or privacy
            rights of any third party.</li>
          <li>Use the Service for unsolicited bulk messaging ("spam"), pyramid schemes,
            multi-level-marketing recruitment, debt collection without proper licensure, payday
            loan solicitation outside permitted bounds, or anything Twilio, AT&amp;T, T-Mobile,
            Verizon, or any other carrier flags as a violation of their messaging policies.</li>
          <li>Reverse engineer, decompile, or attempt to extract the source code of the Service.</li>
          <li>Probe, scan, or test the vulnerability of the Service without our prior written
            consent.</li>
          <li>Use automated tools or scripts to harvest data from the Service.</li>
          <li>Resell, sublicense, or white-label the Service without a written agreement with us.</li>
        </ul>

        <h2>5. Telephony compliance (your responsibility)</h2>
        <p>
          The Service places calls and sends messages over carrier networks on your behalf. You are
          the "sender" for legal purposes. You are solely responsible for:
        </p>
        <ul>
          <li>Maintaining proper opt-in records (date, channel, language used to obtain consent).</li>
          <li>Honoring opt-outs across all channels — WrkPhn enforces STOP/HELP and a voice-keypress
            opt-out, but you remain responsible for any list scrubbing required by law.</li>
          <li>Completing 10DLC brand and campaign registration for US local long-code SMS, or
            Toll-Free Verification for shared toll-free numbers, before sending traffic at scale.</li>
          <li>Acknowledging consent before each agent-call campaign (the Service prompts you).</li>
          <li>Respecting quiet hours and any state-specific calling-time restrictions.</li>
          <li>Including any required identification ("This is a call from [Business]") and opt-out
            instructions in your message bodies and scripts.</li>
        </ul>
        <p>
          You agree to indemnify WrkPhn for any liability arising from your failure to meet these
          obligations (see Section 13).
        </p>

        <h2>6. AI features</h2>
        <p>
          The Service includes AI agents that draft and (with your configuration) send messages or
          place calls without per-message human review. AI output is probabilistic and may be wrong,
          incomplete, or unsuitable. You are solely responsible for everything an AI agent sends
          under your account. We recommend running new agents in "suggest" mode before enabling
          autopilot, and maintaining oversight of sensitive conversations.
        </p>
        <p>
          Voice cloning — when configured with a third-party provider — requires you to have full,
          documented permission to use the source voice. Uploading a voice you do not have rights to
          violates these Terms and may expose you to civil and criminal liability.
        </p>

        <h2>7. Your content</h2>
        <p>
          You retain ownership of all Content you create on the Service. You grant WrkPhn a
          non-exclusive, worldwide, royalty-free license to host, process, transmit, and display
          your Content solely as needed to operate the Service for you. We do not use your Content
          to train models or sell it to third parties.
        </p>

        <h2>8. Service availability and changes</h2>
        <p>
          We will use commercially reasonable efforts to keep the Service available, but do not
          guarantee uninterrupted access. We may modify, suspend, or discontinue features at any
          time, with or without notice. Carrier-imposed throttling, regulatory action, or
          third-party-provider outages may affect your sends; we are not liable for those.
        </p>

        <h2>9. Billing, credits, and refunds</h2>
        <p>
          Paid features are billed via Stripe. Credit purchases are non-refundable except where
          required by law or as a matter of our discretion. Subscription charges (e.g. phone-number
          rentals, A2P 10DLC fees) recur until cancelled. Unused credits remain on your account
          until consumed or until your account is terminated. Carrier per-message and per-minute
          fees flow through at cost; we do not refund spend on messages or calls that were
          successfully delivered.
        </p>

        <h2>10. Termination</h2>
        <p>
          You may terminate your account at any time. We may suspend or terminate your account
          immediately, without refund, for any violation of these Terms, including any acceptable-use
          violation, carrier violation, or risk to other users. On termination, your data may be
          retained or deleted as described in our Privacy Policy.
        </p>

        <h2>11. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED <b>"AS IS" AND "AS AVAILABLE"</b>, WITHOUT WARRANTY OF ANY KIND.
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WRKPHN DISCLAIMS ALL WARRANTIES, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT,
          AND ANY WARRANTY ARISING FROM COURSE OF DEALING OR USAGE OF TRADE. WE DO NOT WARRANT THAT
          THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS, OR THAT
          MESSAGES WILL BE DELIVERED OR CALLS WILL CONNECT.
        </p>

        <h2>12. Limitation of liability — no liability for misuse</h2>
        <p>
          <b>WRKPHN ASSUMES NO LIABILITY WHATSOEVER FOR MISUSE OF THE SERVICE.</b> You are the
          sender of every message and the placer of every call made through your account, and you
          are solely responsible for ensuring that such activity complies with all applicable laws
          and the rights of recipients. WrkPhn is not responsible for, and shall have no liability
          arising out of, any of the following:
        </p>
        <ul>
          <li>Messages or calls you send (or that an AI agent sends under your configuration), or
            their content, timing, recipients, frequency, or interpretation;</li>
          <li>TCPA, CAN-SPAM, state-telemarketing, DNC, GDPR, CCPA, or other regulatory violations
            committed by you or your authorized users;</li>
          <li>Carrier filtering, throttling, blocking, fines, or suspension imposed by any wireless
            carrier or aggregator;</li>
          <li>Disputes between you and your customers, recipients, or any third party;</li>
          <li>Voice clones or audio samples uploaded without proper rights;</li>
          <li>Misuse of AI output, including reliance on AI-generated medical, legal, financial, or
            other advice;</li>
          <li>Loss of data, opportunity, revenue, or goodwill, even where foreseeable;</li>
          <li>Acts or omissions of third-party providers (Twilio, OpenAI, Cloudflare, Fly.io,
            Stripe, ElevenLabs, or any other) used to deliver the Service.</li>
        </ul>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL WRKPHN'S TOTAL CUMULATIVE
          LIABILITY TO YOU FOR ALL CLAIMS RELATING TO THE SERVICE EXCEED THE GREATER OF (a) ONE
          HUNDRED US DOLLARS ($100), OR (b) THE AMOUNTS YOU ACTUALLY PAID WRKPHN IN THE TWELVE (12)
          MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM. WRKPHN SHALL NOT BE LIABLE
          FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, REGARDLESS OF THEORY
          (CONTRACT, TORT, STATUTE, OR OTHERWISE), EVEN IF ADVISED OF THE POSSIBILITY.
        </p>
        <p>
          Some jurisdictions do not allow exclusion of certain warranties or limitation of certain
          damages. In those jurisdictions our liability is limited to the smallest extent permitted
          by law.
        </p>

        <h2>13. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless WrkPhn, its officers, employees,
          contractors, and agents from and against any and all claims, damages, losses, liabilities,
          costs, and expenses (including reasonable attorneys' fees) arising out of or related to:
          (a) your use of the Service; (b) any Content you create, upload, send, receive, or store;
          (c) your violation of these Terms; (d) your violation of any applicable law (including
          TCPA and CAN-SPAM); or (e) any voice sample you upload.
        </p>

        <h2>14. Intellectual property</h2>
        <p>
          The Service, including its software, design, branding, logos, and documentation, is owned
          by WrkPhn and is protected by intellectual-property law. These Terms grant no rights to
          use the WrkPhn marks except as needed to identify the Service in commerce.
        </p>

        <h2>15. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of the State of Washington, USA, without regard to
          conflict-of-laws principles. Any dispute arising out of or relating to these Terms or the
          Service shall be brought exclusively in the state or federal courts located in King County,
          Washington, and you consent to personal jurisdiction there. You waive any right to a jury
          trial and to participate in class actions or class arbitration related to the Service, to
          the maximum extent permitted by law.
        </p>

        <h2>16. Changes to these Terms</h2>
        <p>
          We may update these Terms from time to time. When we do, we will update the "Effective"
          date above and, for material changes, notify you in-product or by email. Continued use of
          the Service after the effective date constitutes acceptance of the updated Terms.
        </p>

        <h2>17. Contact</h2>
        <p>
          Questions: <a href="mailto:legal@wrkphn.com">legal@wrkphn.com</a>. Compliance / abuse
          reports: <a href="mailto:abuse@wrkphn.com">abuse@wrkphn.com</a>.
        </p>
      </article>
    </MarketingLayout>
  );
}
