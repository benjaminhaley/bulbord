# Log

A running set of findings, not a project log. Each entry is dated, has a short title, and free-text notes below — not heavily organized. Newest entries at the top, oldest at the bottom.

This is Ben's own record — user research and findings, not Claude/dev activity. Claude: only add an entry here when explicitly asked to.

---

## 2026-07-23 — Events first

Even before we get into the full camp tab, we should have an events tab. While camp is the killer application and the most important need for families, events is a great, low-effort foot in the door. I'd be interested to see local events in the area, and I'd check that often, reminding me to use the app, whereas camps need booking only rarely. So let's go ahead and start with events.

---

## 2026-07-16 — Finding camps with Gemini Deep Research

Tried to use Gemini Deep Research to find camp listings in the Chicago area. I found it covered maybe the easy fifty percent of the problem. I definitely had to prompt it to find additional camps, and I had to prompt it to dig deeper into those camps' timing and availability. Even then, I'm pretty sure there were inaccuracies.

Furthermore, there are aspects of camp that can't be confirmed without actually logging into a site, actually getting an email, actually trying to make a booking, or making a phone call.

All of this says to me that the ultimate system we need is going to have to have quite a bit of feedback from the community to find opportunities and correct discrepancies, and we'll need to have mechanisms where it can go through some or most of the booking flow — creating accounts, having email, making phone calls, trying to book. Only by doing this will we make sure that the data and quality are really high. These are hard problems to get right, and so it'll be important to solve things in a more straightforward way first.

---

## 2026-07-13 — Interviewing Anna on clubs

**Background**
Spent 30 minutes talking to Anna about what's difficult signing up for clubs and care when school is out.

**Takeaways**

Hard to find
Club listings are very hard to find. Annoyingly, the top source is word-of-mouth from other parents. Some, like Climb Zone, are pretty professionalized and organized. Some, like YMCA camps, are an online website nightmare where you have to cross-reference PDFs against some logged-in search after you create an account. Some are hosted by high schoolers, posted last minute two weeks before they're available, on Instagram or on flyers sent home from school.
- Ask people many times — I'm gonna have to ask people over and over again where they're going, to create a centralized, updated list.
- Needs a bot with login credentials — the ideal bot to find listings would have access to social media for the school Instagram, the ability to log in and sign up for emails beyond the school list — basically have everything a person could have in terms of finding that information.

Booking is terrible
For example, as noted above, to book a YMCA camp, which have pretty good coverage, you have to have logged into their website, look at an online PDF to figure out which camp applies to which week, search for that, then do the booking from there. It's an awful experience. Also, the way booking works changes regularly, so this information needs to be updated and revisited.
- Bot needs to book — ideally, we'd have a bot that actually goes in and tries to book a camp, going through every step except maybe payment information.
- Detailed instructions — if we can't make booking dead simple, we at least need to provide exact, up-to-date instructions about how it's done.

Quality is hard to gauge
It's nearly impossible to tell online if a club or camp is gonna be good, fun, interesting, all that.
- Get reviews — It's critical to get reviews from parents.
