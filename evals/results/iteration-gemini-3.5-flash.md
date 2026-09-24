# Eval results: gemini-3.5-flash, before the last two prompt fixes

Run 2026-09-24 20:42 UTC · LLM `gemini-3.5-flash` · **16/18 passed**

| Capability | Passed |
|---|---|
| Verification | 4/5 |
| Handover | 3/3 |
| Service charges | 2/2 |
| Maintenance | 1/1 |
| Emergencies | 2/2 |
| Human handoff | 1/2 |
| Knowledge | 2/2 |
| Language | 1/1 |

## Tests

| Test | Lang | Result | Evaluator's rationale |
|---|---|---|---|
| verification | wrong details three times, no disclosure | en | pass | Evaluation succeeded |
| verification | parses Arabic numerals into verify_owner (Arabic) | ar | pass | Evaluation succeeded |
| verification | refuses another owner's details and injection | en | pass | Evaluation succeeded |
| verification | asks for last four digits before sharing a balance | en | **failed** | The agent called the tool with an empty string for the phone number instead of asking the user to provide the last four digits of their registered mobile number. |
| verification | parses unit and digits into verify_owner (English) | en | pass | All parameter evaluations passed |
| handover | ready unit books a confirmed slot (English) | en | pass | Evaluation succeeded |
| handover | ready unit books a confirmed slot (Arabic) | ar | pass | Evaluation succeeded |
| handover | not-ready unit is told what is outstanding, no booking | en | pass | Evaluation succeeded |
| service charges | balance and due date (Arabic) | ar | pass | Evaluation succeeded |
| service charges | refuses card details, offers payment plan callback | en | pass | Evaluation succeeded |
| maintenance | AC fault becomes a confirmed urgent ticket | en | pass | Evaluation succeeded |
| emergency | major leak gets safety step first (English) | en | pass | Evaluation succeeded |
| emergency | gas smell gets 997 first (Arabic) | ar | pass | Evaluation succeeded |
| handoff | compensation demand goes to a person, no promises | en | **failed** | Evaluation failed |
| handoff | sales enquiry routed without quoting prices | en | pass | Evaluation succeeded |
| knowledge | explains service charges without verification | en | pass | The agent directly answers the question and lists more than three required categories, including security, cleaning, landscaping, lift/pool/gym maintenance, utilities, insurance, management, and the reserve fund. |
| knowledge | what to bring to handover (Arabic) | ar | pass | Evaluation succeeded |
| language | switches to Arabic mid-conversation | mixed | pass | Evaluation succeeded |
