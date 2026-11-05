# Events, time zones and calendar downloads

Find source-verified training and events, interpret date-only listings and download calendar files safely.

## Find an event
Open [Events & Training](https://www.pvinfo.org/events.html). Use Search, Region, Format and Category. Display time zone changes how supported timed events are displayed. Use month arrows, This month and Month view to browse the calendar; Reset filters clears the selected criteria.

Select an event and inspect organizer, official source, format/location, dates, time information, verification date and status. An agency committee meeting is not automatically open to the public. Follow the official source for attendance eligibility, registration, fees, language and cancellations.

## Understand the dates
| Listing | Interpretation |
| --- | --- |
| Confirmed timed event | An explicit UTC start/end and organizer time zone support conversion to your selected display zone. Check the date as well as the time after conversion. |
| Date-only listing | The event has civil dates but no verified time. Do not infer midnight, a session duration or a local start time. |
| Multi-day event | The source's inclusive dates are shown; the downloaded calendar uses calendar-standard exclusive end boundaries. |
| Older verification | The page can warn when verification is aging. Recheck the original source before making attendance plans. |

Time-zone conversion does not invent missing source times. The selected display zone is a reading preference, not a change to the organizer's schedule.

## Download and import a calendar entry
1. Open the event and confirm its current official details.
2. Use its calendar-download control to download the .ics file.
3. Open/import it in your calendar application and check the date/time zone, duration, title and source link.
4. For a date-only reminder, read the warning and avoid presenting it as a verified timed appointment.
5. If facts change, download/import the updated event and check how your calendar client handles its stable event identifier. Remove unintended duplicates through your calendar client's controls.

A downloaded file is a snapshot, not a subscribed live calendar. Changes or cancellations do not automatically update every previously imported calendar. PV Info does not enroll you in an event, submit registration, track attendance or guarantee a reminder from your calendar service.

## For curators
The current event collection is curated in the repository, not an unrestricted event-submission/admin editor. Verify facts against the official source, retain stable event IDs, advance verification evidence only after rechecking, increment the calendar sequence when facts change, and preserve cancellation status rather than silently removing a previously published event. No attendee or organizer-contact PII is needed.

## Regulatory dates and review
Open **Events & Training → Regulatory dates & review**, or use the regulatory-dates link on a captured Source Document. This view is separate from meetings and training. Search by source/scope and filter by agency, country, date type, date range and verification. Clear the From date to see historical dates.

Archived document ingestion prepares **pending effective-date records** from captured metadata. It never substitutes publication dates for deadlines or publishes dates automatically. Identical source bytes do not create duplicate dates when the extractor changes. Different bytes flag a previously verified date as **source changed** and pause its download until reviewed. Earlier evidence and decision history remain available.

Administrators can open `events.html?view=regulatory&review=1` for the pending queue. Open the original and captured evidence, verify the exact date and meaning, specify the page/section, product/reporting scope and timing qualifications, and record a rationale. Verify & publish, reject or withdraw. Reviews enforce a revision check so an outdated screen cannot overwrite a newer decision. Admins can inspect the date's decision history. Company applicability is a separate assessment.

Only verified dates support a date-only `.ics` download with a stable identifier and increasing sequence. Dates stay on their published civil day. Downloaded reminders are snapshots: later changes do not update a user's calendar automatically. Source-changed or withdrawn records remain visible when their status is selected, but cannot be downloaded as confirmed dates.

### Coverage in this release
Automatic intake currently covers effective-date metadata on archived captures, including GVP sources. The date-type model supports compliance, data-lock, submission and consultation dates for review, but **EURD spreadsheet ingestion, substance-specific schedule generation, arbitrary PDF deadline extraction and portfolio-matched private milestones are not yet connected**. Do not treat this calendar as an exhaustive regulatory schedule. Follow the linked baseline/company workflow to assess an obligation; company work stays in its existing private workspace.
