@@ name: Bypasses
@@ desc: How ad gates and key systems actually work, how to get through them fast, and how to not get scammed doing it.
@@ accent: #f0a050

>>> Overview
>>> What is a gate
Scripts get put behind gates for one reason: money. The developer gets paid per click. That is it. No magic protection, no DRM, just ad revenue.

Two types exist:

| Type | Example | What it does |
|------|---------|--------------|
| Ad gate | Linkvertise, work.ink | Makes you click through ads to get a link |
| Key system | Platoboost, Hydrogen | Script checks a key before running, you fetch the key from their site |

Both have bypasses. Keep reading.

>>> Overview
>>> The timer trick
This is the most important thing in this doc.

When a task page tells you to subscribe to a channel or follow someone, it almost never actually checks if you did it. What it does check is whether you stayed on that page long enough.

Here is the correct way to handle it:

```
1. Gate opens a YouTube / Twitter / Discord link
2. That link opens in a new tab (or you open it yourself)
3. STAY ON THAT TAB for at least 50 seconds
4. Some sites actively detect if you switch away too fast and reset the step
5. After 50s, go back to the original gate tab
6. Click continue
```

> Stay on the task tab. Do not switch back early. The site is watching whether you left too fast, not whether you actually subscribed.

The only tasks that genuinely verify anything are ones that make you paste a code, enter a username, or provide real input. If there is no input field, there is no real check. Just time.

>>> Reading your browser
>>> What is actually happening
Your address bar tells you everything. Get in the habit of glancing at it every time something loads.

| What you see | What it means | What to do |
|---|---|---|
| Refresh icon turns to X, same URL, no new tab | Page is loading, you are progressing | Stay put |
| New tab opens, same domain, looks like next step | Normal step progression | Close the old tab |
| You land on a completely different domain | Ad redirect | Close that tab immediately |
| New tab opens with a URL you do not recognize | Same as above | Close it |

> If the domain in your address bar was never part of the original link, you are no longer where you should be. Close the tab.

>>> Reading your browser
>>> Staying safe on gate pages
One rule covers most situations: **stay on the site**.

A legitimate gate keeps you within its own domain the whole time. Every step, every task, every redirect should stay on the same root domain you started on or go to a known platform like YouTube or Twitter.

If you click something on a gate page and your browser takes you somewhere that is not the gate site and not a platform you recognize, that is an ad redirect or worse. Close it and go back.

>>> Bypasses
>>> Linkvertise
The most common gate. Almost every script hub uses it.

**Tool: bypass.city**

```
1. Copy the Linkvertise URL
2. Go to bypass.city
3. Paste the URL
4. Click bypass
5. Done
```

All of these are Linkvertise, bypass.city handles all of them:

| Domain | Same thing? |
|--------|------------|
| `linkvertise.com` | Yes |
| `link-to.net` | Yes |
| `link-hub.net` | Yes |
| `link-target.org` | Yes |
| `link-center.net` | Yes |
| `direct-link.net` | Yes |

>>> Bypasses
>>> work.ink and 180+ other sites
For work.ink and basically everything else, use **izen.lol**.

**Tool: izen.lol**

```
1. Copy the gate URL
2. Go to izen.lol
3. Paste the URL
4. Bypass
```

Izen covers 44 services across 182 domains. If you hit a gate and you are not sure what it is, try izen first. The full breakdown of what it supports:

| Category | Services |
|----------|---------|
| Key systems | Platoboost, Pandadevelopment, Trigon, Violated, Blox-script, Hydrogen, Codex |
| Ad gates | Linkvertise, work.ink, Lootlabs, Admaven, Shrtfly, Lockr, Sub2Unlock, Sub4Unlock, Rekonise, and 20+ more |
| Paste sites | Pastebin, Paste-Drop, Pastefy, Rentry, Pasterso, Pastelua |

>>> Bypasses
>>> When the bypass fails
Sometimes the bypass just does not work. Here is why.

**The script uses a middleman like Luarmor.**
When you go through a key system legitimately, the site generates a unique callback parameter tied to your session. The bypass tool gets a generic URL with no parameter, so the key system rejects the key. There is no workaround here. You have to do these ones manually.

**The link is expired or private.**
Old links shared in Discord servers go dead. Get a fresh one from the script's actual page.

**The gate was updated recently.**
Bypass sites keep up but sometimes lag behind. Check bypass.city or izen again in a day or two.

> If none of these apply and the bypass is broken, just do it manually. Any legitimate key system should take under 5 minutes.

>>> Key Systems
>>> How long is too long
Simple rule: if a key system takes more than 30 minutes done legitimately, do not finish it. Leave and find a different script.

Legitimate key systems are annoying but fast. Any system designed to take half an hour is either farming your ad clicks, trying to wear you down into installing something, or both. No script is worth that.

>>> Scams
>>> Fake gate pages
Fake gate pages are built to look identical to real ones. The goal is ad revenue at best, malware at worst.

How to spot one:

| Red flag | What it means |
|----------|---------------|
| URL domain is slightly off (`linkvertlse.com`) | Fake. One letter swapped, extra hyphen, wrong TLD |
| Page asks you to download an app or extension | Fake. Real gates never require this |
| Page asks for your Roblox username and password | Fake. Nothing legitimate ever needs this |
| Fonts look slightly off, buttons do not align | Rushed fake |
| You got here from a Discord DM or YouTube comment | Treat with serious suspicion |

> The URL is the only reliable tell on convincing fakes. Read the full domain before you click anything.

>>> Scams
>>> Discord DM grabs
Someone messages you out of nowhere saying they have a working bypass tool or a free script. They send a download link.

It is a grabber. It will lift your Discord token, browser cookies, saved passwords, and anything else it can reach. Your account gets sold or used to DM the same thing to everyone on your friends list.

Nobody legitimate cold DMs you a bypass tool. Ever.

>>> Scams
>>> Fake script hubs
A site that looks like a real script hub but every download is an executable file.

Real scripts are Lua. They are plain text files. A script download should give you a `.lua` file or raw text you can paste.

If a download gives you any of these, close the site immediately:

- `.exe`
- `.bat`
- `.ps1`
- A `.zip` containing any of the above

>>> Scams
>>> Endless human verification
You complete step after step of a verification and nothing resolves. Each step loads another one. It never ends.

This is purely farming your ad clicks. They have no intention of giving you anything. Leave after two steps if you have not made any real progress.

>>> Scams
>>> YouTube comment links
Top comment on a popular Roblox video. Says something like "working bypass 2025 no virus trust". Links to some site.

Assume it is fake until proven otherwise. Real tools do not need YouTube comment promotion. Check if the tool is mentioned in actual communities before touching anything from a comment section.

>>> Scams
>>> Fake key expiry
Your script suddenly says your key expired even though you got it recently. It pushes you back through the whole key system again.

Some developers do this intentionally to generate more ad revenue. Before going through it again, check the script's Discord and see if others are reporting the same thing. If it is happening to everyone at the same time it is probably legitimate maintenance. If it is just you, or if it happens constantly, the developer is farming clicks.

>>> More
>>> Safety and privacy
This doc covers bypasses. For the full picture on staying safe online, avoiding phishing, which browser to use, which extensions actually help, and how to recognize scams before they happen, visit the **Privacy** doc.

That one goes deep. Dozens of sections covering everything a person needs to know to not get got on the internet. Worth reading even if you think you already know most of it.