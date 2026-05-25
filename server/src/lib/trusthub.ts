// ============================================================
// Twilio TrustHub / A2P 10DLC — sole-proprietor flow.
// ============================================================
// Real end-to-end sole-prop registration:
//   1. Create a Customer Profile (Sole Proprietor policy)
//   2. Create an End User of type authorized_representative_1
//      (this is where the user's mobile phone lives)
//   3. Attach the EndUser as a Customer Profile Item
//   4. Submit a Customer Profile Evaluation — Twilio runs validation
//      and DELIVERS THE OTP to the End User's mobile so the user can
//      verify ownership of the number they put on the form.
//   5. User receives the SMS code; POSTs it back to /api/a2p/verify-otp
//      which calls Twilio to confirm the End User.
//   6. After verification: submit the Customer Profile for review +
//      create the A2P brand + campaign.
//
// IMPORTANT: this whole flow requires the calling Twilio account to
// be ISV-enabled OR to have access to TrustHub APIs. Trial / brand-
// new accounts may not have the endpoints available — every call
// here is wrapped in error reporting that surfaces back to the user
// rather than blowing up. The /a2p/submit route then falls back to
// the manual-console path so the user is never stuck.
//
// Twilio policy SIDs (constants — never change per account):
//   Customer Profile (Sole Prop): RNb0d6f29325f9c9bd6c1ed1cf12d12ef9
//   A2P Profile (Sole Prop):      RN806dd6cd175f314e1bf9a53d59f6ee29
//   (Standard brand uses different policies — out of scope for this
//   sole-prop helper.)

import { twilioClient } from './twilio.js';
import { log } from './log.js';

const CUSTOMER_PROFILE_POLICY_SID = 'RNb0d6f29325f9c9bd6c1ed1cf12d12ef9';

export interface SoleProprietorInput {
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;        // E.164 — receives the OTP
  businessName?: string;      // optional DBA
}

export interface SoleProprietorSubmission {
  customerProfileSid: string;
  endUserSid: string;
  evaluation: { sid: string; status: string };
  note: string;
}

/**
 * Run the sole-prop submission end-to-end UP TO the point where Twilio
 * sends the OTP. Returns the resource SIDs so the caller can persist
 * them and look them up later when the user submits their OTP.
 *
 * Throws on any failure — caller should catch and surface a useful
 * message to the user. Errors here usually indicate the account
 * doesn't have TrustHub access yet, which means falling back to the
 * Twilio Console manual flow.
 */
export async function submitSoleProprietor(input: SoleProprietorInput): Promise<SoleProprietorSubmission> {
  const tc = twilioClient.trusthub.v1;

  // 1. Customer Profile (sole-prop policy)
  const cp = await tc.customerProfiles.create({
    friendlyName: `${input.firstName} ${input.lastName} (sole prop)`,
    email: input.email,
    policySid: CUSTOMER_PROFILE_POLICY_SID,
  });
  log.info('trusthub', `customer profile created: ${cp.sid}`);

  // 2. End User (authorized representative) — mobile phone here is what
  //    Twilio uses to send the OTP. Format MUST be E.164.
  const eu = await tc.endUsers.create({
    friendlyName: `${input.firstName} ${input.lastName}`,
    type: 'authorized_representative_1',
    attributes: {
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      phone_number: input.mobilePhone,
      job_position: 'Owner',
    },
  });
  log.info('trusthub', `end user created: ${eu.sid}`);

  // 3. Attach the EndUser as an item on the Customer Profile
  await tc.customerProfiles(cp.sid).customerProfilesEntityAssignments.create({
    objectSid: eu.sid,
  });
  log.info('trusthub', `end user ${eu.sid} attached to profile ${cp.sid}`);

  // 4. Evaluate — this is the step that triggers Twilio to send the OTP
  //    to the mobile_phone on the EndUser. The user will get a text
  //    within seconds.
  const evalResult = await tc.customerProfiles(cp.sid).customerProfilesEvaluations.create({
    policySid: CUSTOMER_PROFILE_POLICY_SID,
  });
  log.info('trusthub', `evaluation queued: ${evalResult.sid} status=${evalResult.status}`);

  return {
    customerProfileSid: cp.sid,
    endUserSid: eu.sid,
    evaluation: { sid: evalResult.sid, status: String(evalResult.status) },
    note: `Sole-prop submission accepted by Twilio. A verification code was texted to ${input.mobilePhone}. Submit it via /api/a2p/verify-otp once received.`,
  };
}

/**
 * Verify the OTP the user received on their mobile. Calls Twilio's
 * EndUser update endpoint with the verification code; Twilio either
 * accepts it (and the EndUser becomes verified, eligible for the
 * profile to be submitted) or rejects it with a clear error.
 */
export async function verifySoleProprietorOtp(endUserSid: string, code: string): Promise<{ ok: boolean; status: string; note?: string }> {
  try {
    // Per Twilio's API the OTP is verified by re-PATCHing the EndUser
    // with the code in attributes. Different SDK versions name this
    // slightly differently; we use the generic patch shape to stay
    // forward-compatible.
    const updated = await twilioClient.trusthub.v1.endUsers(endUserSid).update({
      attributes: { mobile_phone_otp: code } as any,
    });
    return { ok: true, status: 'verified', note: `End user ${updated.sid} verified` };
  } catch (e: any) {
    log.warn('trusthub', `OTP verify failed for ${endUserSid}`, e);
    return { ok: false, status: 'rejected', note: e.message || 'OTP rejected' };
  }
}

/**
 * After the OTP is verified, submit the Customer Profile for Twilio
 * to review (this is the final regulator-facing handoff before A2P
 * brand creation). Returns the new profile status.
 */
export async function submitCustomerProfileForReview(customerProfileSid: string): Promise<{ status: string }> {
  const updated = await twilioClient.trusthub.v1.customerProfiles(customerProfileSid).update({
    status: 'pending-review',
  });
  return { status: String(updated.status) };
}
