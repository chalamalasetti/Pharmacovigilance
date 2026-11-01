# Events & Training pilot

Events is under Explore and remains adjustable through the existing admin menu editor. This first release is curated in `public/data/events.json`: verify every row against the named official source before committing. There is no automated event scrape, newsletter, attendance tracking or public submission flow. No new personal information is collected.

Verification on 1 November 2026 used https://training.meddra.org/ and the EMA November PRAC event page. Only date, title, organizer and location/format claims supported by those sources are included. Registration and language remain unknown unless explicitly confirmed. PRAC is a committee meeting, not an invitation to public attendance. Times from ambiguous conference listings were not included.

For confirmed timed events, store startUtc/endUtc with explicit Z and the organizer's IANA timeZone. Display uses the chosen browser zone. Date-only records retain civil dates without UTC conversion and export transparent date-only reminders with an explicit warning. End dates in JSON are inclusive; ICS end dates are exclusive. Downloads are RFC 5545 text with stable UID, UTC timestamps, escaping, CRLF, Unicode-safe folding and sequence metadata. Cancelled records export CANCELLED status. Imported files are snapshots: changes require downloading again; this is not a subscribed calendar.

Curators must recheck times, status and source before advancing verifiedAt. The UI warns when verification exceeds 14 days. Retain IDs, increment sequence when event facts change, and mark cancellations rather than removing published records. Use a new ID for a different event. All event fields are public organizational data; do not add organizer contacts or attendee details.

Checks include source validation, multi-day date boundaries, UTF-8 line folding, UTC/DST conversion and browser filtering, month overlap, actual downloaded ICS content, empty states and mobile overflow. Calendar-client import in Outlook, Google Calendar and Apple Calendar remains a manual compatibility check.
