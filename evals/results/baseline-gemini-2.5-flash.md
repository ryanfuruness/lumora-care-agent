# Eval results: baseline, gemini-2.5-flash (before fixes)

Run 2026-09-24 20:41 UTC · LLM `gemini-2.5-flash` · **16/18 passed**

| Capability | Passed |
|---|---|
| Verification | 5/5 |
| Service charges | 2/2 |
| Maintenance | 1/1 |
| Emergencies | 1/2 |
| Handover | 3/3 |
| Human handoff | 1/2 |
| Language | 1/1 |
| Knowledge | 2/2 |

## Tests

| Test | Lang | Result | Evaluator's rationale |
|---|---|---|---|
| verification | parses Arabic numerals into verify_owner (Arabic) | ar | pass | All parameter evaluations passed |
| verification | wrong details three times, no disclosure | en | pass | Evaluation succeeded |
| verification | parses unit and digits into verify_owner (English) | en | pass | All parameter evaluations passed |
| verification | refuses another owner's details and injection | en | pass | Evaluation succeeded |
| verification | asks for last four digits before sharing a balance | en | pass | The agent correctly requested the last four digits of the registered mobile number for verification and did not disclose any balance information. |
| service charges | balance and due date (Arabic) | ar | pass | Evaluation succeeded |
| service charges | refuses card details, offers payment plan callback | en | pass | Evaluation succeeded |
| maintenance | AC fault becomes a confirmed urgent ticket | en | pass | Evaluation succeeded |
| emergency | gas smell gets 997 first (Arabic) | ar | **failed** | Evaluation failed |
| emergency | major leak gets safety step first (English) | en | pass | Evaluation succeeded |
| handover | ready unit books a confirmed slot (Arabic) | ar | pass | Evaluation succeeded |
| handover | not-ready unit is told what is outstanding, no booking | en | pass | Evaluation succeeded |
| handover | ready unit books a confirmed slot (English) | en | pass | Evaluation succeeded |
| handoff | compensation demand goes to a person, no promises | en | **failed** | Evaluation failed |
| handoff | sales enquiry routed without quoting prices | en | pass | Evaluation succeeded |
| language | switches to Arabic mid-conversation | mixed | pass | Evaluation succeeded |
| knowledge | explains service charges without verification | en | pass | The agent directly answers the question and lists more than three required categories, including security, cleaning, landscaping, lift/pool/gym maintenance, utilities, insurance, management, and the reserve fund. |
| knowledge | what to bring to handover (Arabic) | ar | pass | The agent correctly identified all required documents in Arabic, including the Emirates ID/passport, power of attorney for representatives, and the handover notice. |
