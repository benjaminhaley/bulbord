# Camp Finder Project

## Goal

Zero to one project to make it easier to find and schedule care and activities for kids.

## Background

School provides an amazing service to families. Kids are safe, cared for, socialized, and educated. Just as importantly, it’s easy to register at the beginning of the year, and showing up each weekday as a parent, you know your kids are in good hands. So you can take on the other important tasks in life like work.

Life outside of those 180 days is really challenging over summer break, spring break, winter break, and various random days off. You have to figure out a plan for how to keep kids safe while you work. After school and during the weekends, you need to find other activities for them or for your whole family. Anyone who’s tried to schedule these things knows how burdensome it is. Hours are spent digging around websites on the phone, wondering if things are of good quality. The experience is 1,000,000 miles away from the speed and simplicity of school.

The goal of this project is to make those things easier. Finding care and activities for kids should be as seamless and high-confidence as booking an Airbnb.

## Key problems to solve

1. Day camps — This is the most painful problem for parents right now: finding and booking all-day care on those work days when kids are not in school due to breaks or days off.
2. Babysitting — Finding and booking high-quality, reasonably priced, ideally local babysitters for date nights, weekend trips, etc.
3. Carpooling — Finding neighbors attending the same clubs, sports camps, etc., who would be willing to split a ride.
4. Play dates — Finding and arranging time with friends that works with both families, especially in those cases where one family is willing to watch both sets of kids.
5. Family activities — What local and regional activities are happening, especially ones that family friends are going to as well.

## Problems not to solve

1. School — The most important kid care activity, but reasonably well solved right now. We certainly don’t have to spend a huge amount of effort each year to find those 180 days of good-quality care for kids.
2. After-school care — While not technically part of the school system, most schools provide some easily accessible options here, or families fall into a long-term routine, so the search cost is amortized over a long period of actually getting after-school service.

## Development path

1. Solve for Anna — Anna, my wife, schedules these activities for our family today. The first goal of this project will be to try to meet her needs around camps. It’s the smallest project I can think of and pretty easy to get feedback.
2. Solve for friends — We know multiple people in the same boat as us, so after Anna, we will try to extend the service to close invited friends—maybe 10 different families we know.
3. Solve for Nettelhorst — Nettelhorst is the school we go to. If we could solve it for Anna and solve it for some friends, maybe we can solve it for most of the families at that school. It will be easy to get feedback and a nice service for the neighborhood. And most of these things have very regional kinds of focuses. As in, solving it for Anna will go a long way toward solving it for the rest of the school community.
4. Generalize — If we can solve for one school, we could try to start solving for neighboring ones.

## Challenging parts and solutions

1. Listings — Finding camps or other forms of all-day care is often impeded by just knowing what the options are: searching the web, looking on Facebook, asking friends and neighbors, getting flyers back from school. One key challenge will be getting great listings of what the available options are. This will require some sort of internet crawling strategy, crowdsourcing, and probably some more intense techniques like calling businesses, perhaps with an automated service, and determining if they really have availability when the information on the website is unclear, as it often is for these kinds of things.
2. Booking — Booking camps is often a terrible process involving poorly built websites, weird user flows, and general brokenness. Ideally, booking would look as easy as it does on Airbnb. You find the thing you want, press book, and learn immediately that your booking has gone through. On the backend, we might need to do quite a bit of concierge service if we’re going to make that part streamlined, like actually calling the place on someone’s behalf or gathering all of their contact info and navigating through the terrible website. Critically, the booking has to go through accurately; there would be nothing worse than showing up for a day of scheduled camp only to find out that your kid didn’t have care that day because the booking was not successful.
3. Evaluation — It’s very hard to tell which camps, babysitters, and activities are actually good from any public online information. That’s why people ask their friends and classmates for recommendations. For our purposes, it will be extremely valuable just to share who from your school or neighborhood is actually taking on an activity or has used it in the past, even if they don’t provide any rating information. With that in mind, we should have a stance toward being open and public with information. Later we might think about some sort of privacy rules, but to start, it should be pretty easy to see what anybody using the tool is actively using and doing in order to give a signal of its quality and know who to ask more about it from.
4. Profit — To begin, this will be a labor of love in service of Anna, friends, and our school. If it ends up being successful in that stage and generalizing, we would seek some sort of profitability strategy centered around booking fees, listing fees, or perhaps subscriptions needed to use the service to its full ability.
5. Coordination and communication — Anybody caring for your kids will need to be in close contact, whether it’s a camp, babysitter, carpooling, or a drop-off play date. It’ll need to be dead simple to text, call, or message between the person booking and the person listing.
6. The network — This project depends critically on trust and localness. To begin with, everybody on the platform should be invited personally by me; later I may grant invite privileges to a select few others. The general principle will be everybody is using one single, real, easy-to-verify identity. To begin with, everything should be gated by a passkey (Face ID or fingerprint, no password) created through another member's invite link; no other type of login should be provided in the first part.
7. Listing info needed — There’s quite a bit of basic info that would be needed about any listing. One is dates and hours of availability, for example, what days does the camp open and what hours can kids get dropped off and picked up. Second is price. Third is the age ranges served. Fourth is the type of activities. Fifth is the location — how hard is it gonna be to get there. Sixth is actual availability — just because a camp is open on a given day doesn’t mean it’s not already fully booked up. Seventh is the booking process — some can be done online, some require a phone call, sometimes you have to get up early and make a phone call at a very particular time in order to book it. Eighth is contact information — how can you call or email in the case of any issues. Ninth is day-of prep — do kids need to bring a lunch, a backpack, sunscreen? Do they need to fill in forms? Is there a certain check-in process? For every listing, we should be trying to gather most of this information.
8. Booker info — Everyone booking will need payment information, contact information, names of the kids, ages of the kids, and any health concerns like allergies.

## Technical considerations

1. Mobile first — People use phones. Everything here should be built for phones first.
2. Web first — If this is successful, it sure needs to be an app on iOS and Android, but it’s a ton of overhead, so let’s start simple.
3. AI built — AI will be doing basically all of the work on early versions of this project. That means it needs to be organized in a way that makes it easy for AI to contribute. Several principles will help here. First, context needs to be documented. I need decisions that are made to be clear in code comments or markdown files. Second, we need design systems on the front end: a clear style guide that we are following so that design stays consistent and not a hodgepodge, or needing feedback every time. Third, we need an engineering architecture that is scalable, something that’s modular with great test coverage, introspectability, and especially most importantly for AI to always be able to look at any work it delivers itself so I can see if it’s built up to the standards of the project.
4. Well organized — The whole project should live in a single folder. Have one GitHub repo, have one database, have one server, etc. Everything should be kept as simple, standard, and well-documented as possible on this front.
