

## TASK 1 — DEFINE THE PROBLEM YOU ARE
## SOLVING


- The Problem (Plain English)
Answer only these questions:
● Who makes the roster? A single MO in a understaffed and overworked department

● Why is it painful? There is no reward for it, extremely time consuming, managing
requests and facing backlash and being labeled as not being impartial.

● What usually causes conflict? Struggling to make a fair roster as everyone wants
their requests to be fulfilled and it takes a lot of time to try and make a roster that
accommodates everyone. People also complain that they have worked more
hours/public holidays than their colleagues and that becomes a reason of conf


- Who the App Is For (Very Specific)
Write one sentence only:
This app is for a single medical officer responsible for creating a monthly
departmental roster and for other users to login and view the rosters and
analytics of the working hours of each doctor.

- What “Success” Looks Like
List 3 measurable outcomes:
● Doctors can see their shifts and hours clearly on their phones

● Requests are transparent and public

● Hour distribution disputes reduce significantly




## TASK 2 — DEFINE THE CORE RULES
This is the most critical task of Week 1.
If these rules are unclear, the auto-roster will fail.

## Task 2 Deliverable
## A Rules & Constraints Document

## A. Department Structure
Answer clearly:
● One Roster per department
● Firms are labels and do not interfere with the working hours of the doctors
## ●

## B. Shift Rules

● Shift Regular department (BASIC):
○ Weekend shift
## ■ Start: 08:00
■ End: 08:00 next day
■ Total: 24 hours
○ Weekday shift
## ■ Start: 16:00
■ End: 08:00 next day
## ■ Total: 16 Hours
○ May have a 1st and 2nd on call (2nd on call being the consultant or senior
MO/Registrar
● Shift ED:
○ Split into different periods e.g. 8 hour shift
○ Specific rules can be implemented that if you worked a night, cannot work day
straight on next day
● Custom shift feature to define the shift breakup for weekdays and weekends, what
constitutes overtime hours and total hours.

● DOCTORS NOT TO BE ON CALL FOR CONSECUTIVE DAYS/SHIFTS. Unless
authorised by the admin

## C. Monthly Fairness Rule

● Monthly target: hours should be as equal as possible
● Acceptable discrepancy target: ≤ 1 shift and weekend shift discrepancy target ≤  1
shift
● If impossible: app must show a warning explaining why as moderated by the admin
(MO incharge).
● Weekends must be split equally among all doctors. But if unable to accommodate
everyone then the system will penalize doctors who have requested leave/days
preferred not to work.


D. Public Holiday Fairness (Longitudinal)
● Public holiday hours are tracked cumulatively

● They are not forced to balance monthly

● Doctors can see:

○ monthly holiday hours

○ total holiday hours over time

● App should prefer assigning holidays to those with fewer cumulative holiday hours.
● Public holiday fairness is evaluated over time, not per month.
● Public holidays worked are tracked over a calender year.

## E. Visibility Rules

● All doctors can see:

○ the full roster


○ everyone’s total hours

○ everyone’s public holiday totals

● All requests are public

● No private requests exist


## TASK 3 — DEFINE REQUESTS &
## BEHAVIOUR

## Task 3 Deliverable
## A Requests & Workflow Document

## A. Request Types

● Unavailable (doctor cannot work this date)
● Swap (doctor proposes another doctor)- moderated by the admin after preliminary
roster is made
● Preference to work certain dates (for later versions)
● Approved leaves of doctors
● The doctor who requests first gets preference by the system.


## B. Request Visibility
● Requests are visible to all doctors

● Reasons are optional and only visible to admin
● Requests do NOT auto-change the roster. Roster is made by giving priority to the
doctor that requested first, if conflicts arise and not everyone can be accommodated
then the admin may approve/reject requests to complete the roster.



## C. Admin Responsibility

● Admin reviews requests

● Admin approves or rejects if roster cannot accommodate all requests

● App checks for:

○ conflicts

○ duplicate assignments

● App recalculates hours after approval


## TASK 4 — DEFINE THE MVP FEATURE
## BOUNDARY


## Task 4 Deliverable
A Hard “Yes / No” Feature List

Feature v1
Phone-first web app YES
Offline roster viewing YES
WhatsApp sharing (PDF/image) YES
Auto roster generation YES
Public requests YES
Multi-department accounts NO
Native mobile apps NO

Push notifications NO
AI optimisation NO
This document is your shield later.

## TASK 5 — VALIDATE WITH A REAL
## SCENARIO


## Task 5 Deliverable
A Worked Example Roster (On Paper / Spreadsheet)



## Date Day Shift Start →
## End
## Doctor
01-Feb Sun Weekend
## (24h)
## 08:00 →
## 08:00
(Mon)
## A
02-Feb Mon Weekday
## (16h)
## 16:00 →
## 08:00
(Tue)
## B
03-Feb Tue Weekday
## (16h)
## 16:00 →
## 08:00
(Wed)
## C
04-Feb Wed Weekday
## (16h)
## 16:00 →
## 08:00
(Thu)
## D
05-Feb Thu Weekday
## (16h)
## 16:00 →
## 08:00
(Fri)
## E

06-Feb Fri Weekday
## (16h)
## 16:00 →
## 08:00
(Sat)
## F
07-Feb Sat Weekend
## (24h)
## 08:00 →
## 08:00
(Sun)
## C
08-Feb Sun Weekend
## (24h)
## 08:00 →
## 08:00
(Mon)
## B
09-Feb Mon Weekday
## (16h)
## 16:00 →
## 08:00
(Tue)
## C
10-Feb Tue Weekday
## (16h)
## 16:00 →
## 08:00
(Wed)
## D
11-Feb Wed Weekday
## (16h)
## 16:00 →
## 08:00
(Thu)
## E
12-Feb Thu Weekday
## (16h)
## 16:00 →
## 08:00
(Fri)
## F
13-Feb Fri Weekday
## (16h)
## 16:00 →
## 08:00
(Sat)
## A
14-Feb Sat Weekend
## (24h)
## 08:00 →
## 08:00
(Sun)
## D
15-Feb Sun Weekend
## (24h)
## 08:00 →
## 08:00
(Mon)
## E
16-Feb Mon Weekday
## (16h)
## 16:00 →
## 08:00
(Tue)
## B
17-Feb Tue Weekday
## (16h)
## 16:00 →
## 08:00
(Wed)
## C

18-Feb Wed Weekday
## (16h)
## 16:00 →
## 08:00
(Thu)
## D
19-Feb Thu Weekday
## (16h)
## 16:00 →
## 08:00
(Fri)
## E
20-Feb Fri Weekday
## (16h)
## 16:00 →
## 08:00
(Sat)
## A
21-Feb Sat Weekend
## (24h)
## 08:00 →
## 08:00
(Sun)
## F
22-Feb Sun Weekend
## (24h)
## 08:00 →
## 08:00
(Mon)
## A
23-Feb Mon Weekday
## (16h)
## 16:00 →
## 08:00
(Tue)
## C
24-Feb Tue Weekday
## (16h)
## 16:00 →
## 08:00
(Wed)
## F
25-Feb Wed Weekday
## (16h)
## 16:00 →
## 08:00
(Thu)
## E
26-Feb Thu Weekday
## (16h)
## 16:00 →
## 08:00
(Fri)
## F
27-Feb Fri Weekday
## (16h)
## 16:00 →
## 08:00
(Sat)
## D
28-Feb Sat Weekend
## (24h)
## 08:00 →
## 08:00
(Sun)
## B
Totals (shifts, weekend days, hours)
## Docto
r
Weekday shifts
## (16h)
Weekend shifts
## (24h)
## Total
shifts
Total hours

## A 2 2 4 (2×16) + (2×24) =
## 80
## B 2 2 4 80
## C 4 1 5 (4×16) + (1×24) =
## 88
## D 4 1 5 88
## E 4 1 5 88
## F 4 1 5 88



## END-OF-WEEK 1 CHECKLIST (MUST
## PASS ALL)
Before moving to Week 2, confirm:
● I can explain the app in 2 minutes without buzzwords

● I have written rules, not ideas

● A stranger could follow my documents

● I resisted adding extra features

● My paper roster feels fair

If any box is unchecked → fix it before continuing.

