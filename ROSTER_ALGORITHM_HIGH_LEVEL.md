# RosterSync Roster Generation Algorithm - High-Level Overview

## Introduction

Hello! As a doctor working in healthcare, you know firsthand how challenging it can be to create fair and workable rosters for your department. The RosterSync algorithm is designed to automate this process while keeping fairness at the forefront. This document explains how the system works in simple, everyday language - no technical jargon or code. We'll walk through the key ideas, why they're important, and how they help create better rosters.

Think of this algorithm as a smart assistant that assigns shifts day by day, making sure no one gets unfairly burdened while respecting everyone's needs and requests. It's built on principles that doctors like you have helped shape, focusing on equity, rest, and practicality.

---

## What the Algorithm Does

The RosterSync system takes your department's doctors, their past work history, and any approved time-off requests, then creates a complete monthly roster. It does this by going through each day of the month one at a time, deciding who should work that shift based on fairness rules.

Here's the big picture:
- **Input**: List of doctors, their work history, approved requests (like leave or unavailability)
- **Process**: For each day, find the most fair doctor to assign
- **Output**: A full roster plus a report on whether it's fair enough

The goal is simple: create a workable schedule that spreads the work evenly while respecting hard limits like approved leave.

---

## Core Principles That Guide the System

The algorithm is built on six main ideas that ensure fairness and practicality. These aren't just rules - they're based on real healthcare challenges.

### 1. Fairness Across Months (Cross-Month Equity)

**What it means**: The system remembers how much everyone has worked in previous months and uses that to balance things out.

**Why it matters**: Imagine Dr. Smith worked 200 hours in January while others worked 150. In February, the system will try to give Dr. Smith fewer hours so everyone ends up closer to equal over time.

**Real-world impact**: Prevents one doctor from always getting the short end of the stick month after month. It's about long-term balance, not just this month's numbers.

### 2. Kindness to New Team Members

**What it means**: Doctors who just joined don't get overloaded just because they have less history.

**Why it matters**: A new doctor with only 50 hours of experience shouldn't suddenly work double shifts to "catch up." The system gives them a fair starting point.

**Example**: If the average doctor has worked 400 hours in the last few months, a new doctor with 50 hours gets treated as if they have about 320 hours - enough to integrate without burnout.

### 3. No Back-to-Back Shifts (Rest Protection)

**What it means**: No doctor works two shifts in a row.

**Why it matters**: Healthcare work is demanding. Doctors need time to rest between shifts to stay safe and effective.

**Real-world impact**: If someone worked yesterday, they're automatically not considered for today. This is a firm rule that protects well-being.

### 4. Spreading Out Work (7-Day Rolling Window)

**What it means**: No doctor works more than 2 shifts in any 7-day period.

**Why it matters**: Prevents clustering of shifts that could lead to exhaustion.

**Example**: If a doctor worked on Monday and Wednesday, they can't work again until the following Monday. This ensures steady distribution.

### 5. Weekend Fairness (Special Attention to Weekends)

**What it means**: When assigning weekend shifts, the system prioritizes doctors who have done fewer weekends.

**Why it matters**: Weekends are precious personal time. Everyone should share this burden equally.

**Real-world impact**: If Dr. Jones has done 3 weekends and Dr. Lee has done 1, Dr. Lee gets priority for the next weekend shift.

### 6. Public Holiday Consideration (Long-Term Tracking)

**What it means**: Public holiday shifts are tracked cumulatively across the year, and doctors with fewer holiday hours get preference.

**Why it matters**: Holiday time is valuable and often contested. The system ensures fair distribution over time.

**Example**: If Dr. Patel worked Christmas last year but Dr. Kumar didn't, Dr. Kumar might get priority for this year's holiday shifts.

---

## How the System Processes a Month

Let's walk through what happens when you generate a roster for, say, March 2026.

### Step 1: Getting Ready (Setup)

The system gathers:
- All doctors in your department
- Their work history (hours, weekends, holidays from past months)
- Any approved requests for time off
- Public holidays for the month

It also calculates some averages to understand the department's overall workload.

### Step 2: Day-by-Day Assignment

For each day of the month:

**A. Check the Day's Characteristics**
- Is it a weekend? (Saturday/Sunday)
- Is it a public holiday?
- What type of shift is needed? (16-hour weekday or 24-hour weekend)

**B. Identify Who Can't Work**
- Doctors on approved leave
- Doctors who worked yesterday (no consecutive shifts)
- Doctors who have reached their 7-day shift limit

**C. Find the Most Fair Person**
From the remaining doctors, the system picks the one who needs the shift most fairly. It considers:
1. Weekend balance (if it's a weekend)
2. Holiday balance (if it's a holiday)
3. Recent workload (last 7 days)
4. Overall hours (past + current month)
5. Whether they're new to the team
6. How long it's been since their last shift

**D. Make the Assignment**
- Assign the shift to the chosen doctor
- Update their monthly totals
- Mark when they last worked

### Step 3: Handle Difficult Days (Fallbacks)

Sometimes, no one perfectly fits the rules. The system has backup plans:

**First Backup**: Allow consecutive shifts if absolutely necessary, but still respect leave requests.

**Second Backup**: Allow someone to exceed the 7-day limit, but only if it's the only option.

**Last Resort**: If everyone is on leave, leave the day unassigned (rare, and flagged for manual review).

The key is: a shift always gets assigned unless the entire department is unavailable.

### Step 4: Final Check (Fairness Report)

After all assignments, the system reviews the roster:
- Are hours reasonably equal? (Difference should be no more than one shift's worth)
- Are weekends fairly distributed? (No one should have many more weekends than others)

If not, it generates warnings for you to review.

---

## How workload history works (drafts, New Year, and empty data)

This section matches how the live product behaves today.

### When numbers change

- **Draft rosters** (generate / edit without publishing) **do not** change anyone’s long-term totals. They only affect what you see for that month on screen.
- **Publishing** a roster **adds** that month’s hours, weekend count, and public-holiday hours onto the totals stored on each doctor’s profile. There is one running total per field, not a separate total per calendar year.

### New Year and long-term use

- **Nothing automatically resets on 1 January.** Total hours, total weekend shifts, and total public-holiday hours keep accumulating across years for as long as you keep publishing. That supports long-run fairness (“who has carried the team over time?”).
- The **detailed** technical doc states that public-holiday hours are tracked **across years** (not “reset every January” in the database). If the app sometimes says “this year” next to a figure, treat that as shorthand for “what we’re showing in this screen” unless the code explicitly filters by year — the default storage is **all published history**.

### Rebuild (“sync”) totals

- Admins can run a **rebuild** that **replaces** those three fields with sums recomputed from **every** roster marked final in the database (organisation-wide in a typical single-hospital install). People who never appear on any published roster end up with zeros. Use this after imports or if totals were wrong before tracking existed.

### Everyone starts at zero (new department or new app)

- If **all** doctors have **no** published history yet, nobody gets an automatic advantage from old totals. The scheduler still fills the month using the same safety rules; ranking is naturally even until the first publish starts building history.

### New doctor joins later

- A new account (or new person on the team) usually has **zero** totals until their first published months. The system is designed so they are **not** stuck forever at “lowest history” in a punishing way: new-starter handling and fair-share behaviour (see earlier sections) keep early months reasonable.

### Scheduling window: all-time vs this calendar year

- In the app **Balance** screen, admins can choose **full history** (default) or **this calendar year only** for who is considered “ahead” or “behind” when building a draft.
- **Publishing** still always updates the **permanent all-time** totals on each profile; nothing is deleted when a new year starts.
- **This year only:** the scheduler sums published final rosters in the **same calendar year as the month being generated** (e.g. 2026 drafts use only 2026 published months before that draft). January therefore starts even for fairness until the first months are published.
- **Staff / Transparency** can show both the scheduling window and the all-time line when “this year only” is selected.

---

## Department admin settings (Balance page)

Admins change department-wide rules from the in-app **Balance** screen. They are saved per department and used the next time a roster is generated or regenerated, and they decide when amber “please review” messages appear.

| Setting (plain language) | What it affects |
|--------------------------|----------------|
| **Past work — scheduling window** | **Full history** (default): every published month counts toward who is due a lighter stretch. **This calendar year only**: only published months in the roster’s year count for fairness; older years stay visible but do not tilt the next draft. |
| **Monthly hours spread** | Largest allowed gap between the person with the **most** on-call hours this month and the person with the **least**, in **one calendar month** only. Also caps how far the “evening out” pass can move weeknight assignments. |
| **Weekend nights spread** | How many **extra** Saturday/Sunday on-call blocks one person may have compared with whoever has the fewest, in the same month, before a review message. |
| **Minimum clear days between nights** | Whole calendar days off between on-call nights for the same person. Zero means back-to-back nights are allowed only for severely short-staffed teams. |
| **Most nights in any rolling week** | Caps on-call nights in any sliding 7-day window so nobody stacks too many shifts in one week. |

**Not on this screen:** How a **brand-new colleague** first enters the rota (e.g. full pace from week one vs starting next month) is set on their **Staff** profile, not under Balance.

---

## Key Concepts Explained

### What Makes Someone "Eligible"?

A doctor is eligible for a shift if:
- They're not on approved leave (and soft unavailability is still respected when possible)
- They have had enough clear days since their last on-call night (admin sets how many)
- They are under the cap for how many on-call nights anyone may carry in a rolling week (also admin-set; default is two)

### How "Fairness" is Determined

The system uses a priority list - like a checklist - to decide who gets the shift:

1. **Weekend Balance**: Fewest weekends gets priority (weekends only)
2. **Holiday Balance**: Fewest holiday hours gets priority (holidays only)
3. **Recent Work**: Fewest shifts in last 7 days
4. **Total Hours**: Lowest combined hours (past + present)
5. **New Team Member**: Slight preference for newer doctors
6. **Rest Time**: Whoever rested longest since last shift

It goes through this list until it finds a clear winner.

### What About Requests?

- **Approved Leave**: Always respected - doctor won't be assigned
- **Unavailability**: Same as leave
- **Swaps**: Handled separately, not during auto-generation
- Only approved requests affect the algorithm

### Shift Types

- **Weekday**: 16-hour night shift (4pm to 8am next day)
- **Weekend**: 24-hour shift (8am to 8am next day)

---

## Real-World Examples

### Example 1: A Typical Month

Imagine a 6-doctor team in February (28 days):
- 8 weekend shifts (4 Saturdays + 4 Sundays)
- 20 weekday shifts
- Total: About 160 hours per doctor

The system spreads this out so everyone gets roughly equal hours and weekends.

### Example 2: New Doctor Joins

Dr. Garcia joins in March with minimal hours. The system:
- Treats her as having proportional hours (not zero)
- Gives her regular shifts to integrate
- Doesn't overload her to "catch up"

### Example 3: Holiday on Weekend

Christmas falls on a Saturday. The system:
- Considers both weekend fairness AND holiday fairness
- Prioritizes doctors with fewest weekends AND fewest holiday hours
- Makes it a highly competitive assignment

### Example 4: Everyone Busy

Mid-month, all doctors have reached their 7-day limit. The system:
- Relaxes the limit temporarily
- Assigns to the doctor with lowest overall hours
- Ensures someone works, but notes the exception

### Example 5: Department on Leave

Valentine's Day, and everyone requested leave. The system:
- Can't assign anyone (respects all leave)
- Flags the day as unassigned
- Requires manual intervention

---

## Why This Approach Works

### Balances Competing Needs
- **Fairness**: Long-term equity across months
- **Practicality**: Always produces a workable roster
- **Safety**: Protects against overwork and consecutive shifts
- **Flexibility**: Respects individual requests

### Handles Real Healthcare Challenges
- **Variable Workloads**: Accounts for different start dates
- **Precious Time**: Special handling for weekends and holidays
- **Rest Requirements**: Hard limits on consecutive work
- **Department Changes**: Adapts to new team members

### Provides Transparency
- **Clear Rules**: Everyone understands the priorities
- **Detailed Reports**: See exactly why assignments were made
- **Warnings**: Know when fairness goals weren't met

---

## Areas for Your Input

As a practicing doctor, your perspective is invaluable. Here are some questions the system could benefit from your insights:

1. **Rest Periods**: Is the no-consecutive-shifts rule sufficient, or should there be minimum days off between shifts?

2. **Weekend Impact**: Are weekends equally burdensome for everyone, or should factors like family commitments be considered?

3. **Holiday Fairness**: Should public holidays be weighted differently based on cultural/religious significance?

4. **New Doctor Integration**: How quickly should new team members reach full workload?

5. **Shift Types**: Do the current 16-hour and 24-hour shifts match real clinical needs?

6. **Request Handling**: How should different types of unavailability (personal vs. professional) be prioritized?

Your feedback on these points would help refine the algorithm to better serve healthcare teams like yours.

---

## Summary

The RosterSync algorithm creates fair, workable rosters by:
- Processing one day at a time
- Applying fairness rules in priority order
- Respecting hard limits while being flexible when needed
- Tracking work across months for true equity
- Providing clear reports on fairness

It's designed to reduce the administrative burden on department leads while ensuring doctors get fair treatment. The system learns from real healthcare needs and can be adjusted based on your experience in the field.

If you'd like to discuss any aspect in more detail or suggest improvements, I'm here to help!