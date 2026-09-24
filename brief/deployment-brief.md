# Deployment brief: an AI voice agent for owner care

*How I'd take the Lumora Care agent from demo to production at a UAE property developer. Lumora is fictional. Every figure marked "assumption" is a placeholder, to be replaced with the client's own baseline during discovery.*

## The problem

Once a developer hands over its units, its care centre carries three kinds of load:

- **Handover waves.** A tower completes and hundreds of owners call within a few weeks, all asking whether they're ready, how to book, and what to bring.
- **Service-charge cycles.** Invoices go out, and the lines fill with balance questions, payment-method questions and requests for instalments.
- **Maintenance.** This runs all year. Some calls are emergencies that arrive after hours, when only security is answering.

Most of these calls are repetitive and answered from a small set of systems: CRM, the handover scheduler, finance, and the maintenance system (CAFM). The expensive part is not the answer but the path to it. The owner waits in a queue, gets verified by hand, and the agent looks the answer up in three places. If the call then needs a specialist, it's passed on without context and the owner repeats everything. Owners call in English and Arabic, and many switch between the two in the same call.

## What changes

| Step | Today | With the agent | Who owns it |
|---|---|---|---|
| Answer | IVR menu, then a queue | Answered at once, any hour, in either language | Agent |
| Verify | Manual questions, inconsistent | Unit number plus last four digits of the registered mobile, enforced in the backend | Agent |
| Look up | The care agent checks CRM, finance and the scheduler one by one | Tool calls to each system in seconds | Agent |
| Resolve | Book, explain, or log a ticket | Same, with a read-back and confirmation before any action | Agent |
| Emergencies | Voicemail or security after hours | Safety instruction first, then an emergency ticket and a high-priority callback | Agent, then on-call team |
| Hand off | Cold transfer, owner repeats the story | Callback case with a two-sentence summary and the caller's language | Human |
| Judgment calls | Mixed in with routine calls | Complaints, compensation, disputes, payment plans and sales go only to people | Human |

The redesign is not "a bot in front of the queue". The humans stop doing lookups and start at the point where judgment is needed, already holding the context.

## Scope of the pilot agent

This repo is the pilot. It covers four intents and a handoff path:

- verification
- handover (status, slots, booking)
- service charges (balance, due dates, what they cover, payment-plan requests)
- maintenance (triage into category and urgency, with defects-liability coverage)
- human handoff with a summary

It's deliberately narrow. Adding scope is cheap once the first slice is trusted; recovering trust after a bad launch is not.

## Guardrails

- **Verification is enforced in code, not only in the prompt.** Account tools refuse to answer until `verify_owner` has succeeded in the same conversation, whatever the model decides. The caller gets three attempts.
- **No payments or sensitive identifiers on the call.** The only verification detail is the last four digits of the mobile. The agent never takes card numbers, full Emirates ID numbers or one-time codes.
- **The agent never promises what a human must decide.** It makes no commitments on compensation, refunds, waivers or dates beyond what the systems return.
- **It confirms before acting.** Every booking, ticket and callback is read back to the caller first.
- **Emergencies bypass everything.** The safety step comes before verification.

## How quality is measured

Measurement happens in two layers, and they use the same definitions.

1. **Before release: a regression suite.** [`evals/`](../evals) holds 18 tests across eight capabilities, in English, Arabic and mixed conversations.
   - Each test is a simulated caller run against mocked systems, a check on the exact tool call, or a check on the agent's next reply.
   - Any change to the prompt, tools or model has to pass the suite before it ships.
   - The same suite compares candidate LLMs on pass rate before one is chosen.
2. **In production: post-call analysis.** Every real conversation is scored by ElevenLabs against five criteria:
   - verified before disclosure
   - resolved or correctly escalated
   - safety first on emergencies
   - no sensitive data collected
   - confirmed before acting

   Each call also records its intent, language, verification status, escalation and any reference created. These feed the pilot dashboard and a weekly review of a sample of failed and low-confidence calls.

## Rollout

| Phase | Scope | Exit gate |
|---|---|---|
| 0. Readiness | Integrations built as server-side webhook tools; Arabic reviewed by native-speaking care staff; red-team session | Eval suite 100% on safety and verification tests, ≥ 90% overall |
| 1. After hours | One community, 8 pm to 8 am plus overflow | Zero verification breaches; every emergency escalated correctly; owner satisfaction at or above the human baseline |
| 2. Business hours | Pilot communities, all hours, warm handoff to the care team | Containment of the four pilot intents at or above target; transfer summaries rated useful by agents |
| 3. Portfolio | All communities; outbound reminders for handover readiness and overdue charges | Business case confirmed against the phase 2 baseline |

## Production architecture

In the demo, the tools run in the browser against mock data so that it needs no backend. In production:

- **Systems of record.** Each tool becomes a webhook into the developer's systems: CRM, handover scheduling, finance and CAFM. The tool contracts in [`agent/tools.json`](../agent/tools.json) stay the same, and verification state is held server-side.
- **Telephony.**
  - The agent sits on the care-line number through a SIP trunk or telephony provider.
  - Human handoff becomes a live transfer to the care-centre queue, with the summary passed along.
  - The callback case remains the fallback outside hours.
- **Access.** The agent is private and started with signed URLs or tokens from the developer's backend. The public allowlisted agent is only for the demo.
- **Data.**
  - Conversation retention is set to the developer's policy.
  - Personal data is kept to a minimum in tool payloads.
  - Hosting and residency are reviewed against UAE data-protection requirements before phase 1.
- **Change control.** The agent, tools and knowledge base are code ([`scripts/deploy.py`](../scripts/deploy.py)). A prompt change is a pull request that runs the eval suite before it's deployed.

## Value model (illustrative)

A worked example for a developer with 20,000 units under management. Every input is an assumption, to be replaced with the client's data during discovery.

| Input | Assumption |
|---|---|
| Owner contacts per unit per year | 5 |
| Contacts per year | 100,000 |
| Share within the pilot intents | 70% |
| Containment of pilot intents at steady state | 60% |
| Fully loaded cost per human-handled contact | AED 22 |
| Average agent-handled call length | 3.5 minutes |
| All-in agent cost per minute (platform, LLM, telephony) | AED 0.50 |

- **Contacts resolved without a human:** 100,000 × 70% × 60% = 42,000 per year, or about AED 0.92M of human handling.
- **Agent running cost:** about AED 0.18M per year, since every call reaches the agent first.
- **Net:** about AED 0.75M a year, before counting:
  - after-hours emergency coverage
  - shorter handling time on escalated calls, because of the summary
  - cleaner ticket data
  - handover-wave peaks absorbed without temporary staff

## Commercial structure

I'd propose three parts:

- **Implementation fee.** A fixed fee for integrations, Arabic content review and the phase 0 readiness gate.
- **Platform fee.** A monthly fee covering the agent, languages, monitoring and the regression suite.
- **Per resolved contact.** A fee for each resolved contact above an agreed baseline, with a floor and a cap.

"Resolved" uses the same definition as the post-call criterion *resolved or correctly escalated*, restricted to contacts that produced an outcome without a human. It's audited monthly on a sample of calls.

This ties the fee to the result the developer cares about, a contact handled well without a person, rather than to minutes. It also makes the eval definitions the billing definitions, so quality and price can't drift apart. The main risk is disagreement over what counts as resolved. That's handled by fixing the definition and the audit sample during the pilot, before the outcome fee starts.
