@@ name: Privacy
@@ desc: Browsers, link safety, phishing, passwords, Discord, and how to not get your stuff stolen.
@@ accent: #6ab0f5

>>> Overview
>>> What this covers
Read this before something goes wrong, not after.

| Section | What it covers |
|---------|---------------|
| Browser | Which one to use depending on what you are doing |
| Link Safety | How to tell if a link is sketchy before you click it |
| Phishing | How fake pages work and how to spot them |
| Passwords | Why yours is probably a problem and how to fix it |
| Two-Factor Auth | The one thing that saves your account when your password leaks |
| Discord | How accounts get stolen and what to do if it happens to you |
| Downloads on Mac | What to look out for before you open a file |
| Network Monitoring | Seeing what your apps are actually doing on the network |
| VPN | What a VPN actually does, when it helps, and which ones not to touch |
| Public Wi-Fi | What is actually risky and what is overblown |
| Mac Settings | Built-in stuff worth turning on |

If you came here from the Bypasses doc, start with Link Safety and Downloads.

>>> Browser
>>> Which browser to use
The best setup is two browsers: one for everyday use, one you open only for key systems and gate pages. Keep them completely separate.

**For everyday browsing:**

Use **Firefox** with two extensions: uBlock Origin and Privacy Badger. That combo handles ads, trackers, and a lot of the background noise sites load without asking. Firefox is free, fast on Mac, and not built by a company whose revenue depends on watching you browse.

**For key systems and gate pages (occasional use):**

Use **Chrome** for this. Gate sites are built around it and things tend to just work. Keep it as a throwaway browser you open only for this purpose. Do not log into anything in it, do not save passwords in it. Get through the gate, close it.

**If you are doing key systems all the time:**

**OperaGX** is worth a look. The layout is easier to navigate for this kind of use. Privacy is not its strong suit but if you are living in key systems it is a comfortable option.

> Keep your everyday browser and your gate browser completely separate. What happens on gate pages stays in that browser.

Gate pages and key system sites are built to make money off clicks and ad traffic. They load trackers and redirect chains you do not want anywhere near the browser where your email and Discord are open. Separation means even if something sketchy loads, it is contained.

>>> Browser
>>> Firefox setup for Mac
Open Settings with Command + comma after installing Firefox and change these:

| Setting | Where to find it | What to set it to |
|---------|-----------------|------------------|
| Enhanced Tracking Protection | Privacy & Security | Strict |
| Send technical and interaction data | Privacy & Security | Off |
| HTTPS-Only Mode | Privacy & Security | Enable in all windows |
| Search engine | Search | DuckDuckGo |
| Search suggestions | Search | Off |

Then install these two extensions from addons.mozilla.org:

- **uBlock Origin** - blocks ads and trackers. Runs in the background, nothing to configure after install.
- **Privacy Badger** - learns as you browse and blocks trackers it finds. Works alongside uBlock, not as a replacement.

That is all you need. Every extension you add is something that can go wrong later.

>>> Link Safety
>>> Before you click anything
Two seconds to check a link before clicking is probably the single most useful habit in this whole doc.

**On Mac with the Discord desktop app:**

Hover your mouse over any link before clicking. The actual destination URL appears in the bottom left corner of the screen. That URL is what matters, not what the clickable text says.

**On iPhone with Discord:**

Press and hold on a link. Discord shows a preview with the full URL at the top. Read it before tapping Open.

**What you are actually looking at:**

```
https://discord.com/channels/123456
        ^^^^^^^^^^
        This is the domain. This is all that matters.
```

The domain is everything between `https://` and the first `/`. That is where you are actually going. Everything after that slash is just a path within that site.

| What you see | What it means |
|--------------|--------------|
| `discord.com` | You are going to Discord |
| `discord.com.verify-login.net` | You are going to verify-login.net, not Discord |
| `discrod.com` | Typo in the domain, this is a fake site |
| `discord-gift.com` | A completely different site |
| `accounts.google.com` | You are going to Google |
| `google.com.phishing.ru` | You are going to phishing.ru, not Google |

The trick is putting the real site name somewhere in the URL so it looks right at a glance. Read the full domain before you go anywhere.

> Unsure about a domain? Copy it, paste it into Google, and see what comes up. Takes ten seconds.

>>> Link Safety
>>> Discord link warnings
When you click an external link in Discord, it shows a warning box with the full URL before opening anything.

Do not just hit Continue. Read the URL in that box. A lot of people dismiss it without looking and that is exactly where things go wrong.

- Domain you recognize and were expecting: fine to continue
- Something you do not recognize: close the box
- Known platform like YouTube: fine
- Any domain you have never heard of: close it

Discord also shows a red warning on links it already knows are malicious. If you see a red warning, just stop.

>>> Link Safety
>>> Links in DMs from strangers
If someone you do not know sends you a link, treat it as bad unless you have a clear reason not to.

Common formats:

- "Hey I was looking at your profile and I think you might be violating Discord TOS, here is the link to verify your account"
- "Free Nitro for the next 24 hours, click here to claim"
- "Someone reported your account, verify here or it gets deleted"
- "Check out this clip" from an account you have never talked to

Discord does not contact you about TOS violations through random users messaging you. Free Nitro is not handed out through DMs from strangers. Any message with urgency attached to it, "limited time" or "act now" or "your account will be deleted," is a scam.

Even if the account looks real with a normal profile: it might have already been compromised and is now being used to spread the same link to everyone on their friends list.

>>> Phishing
>>> What phishing actually is
Phishing is when someone builds a fake version of a real site and gets you to type your login into it. The page can look exactly like the real thing: same colors, same logo, same layout. The only thing that gives it away is the URL.

You type your password, it goes straight to whoever made the fake page, and you get redirected to the real site or an error. You might not realize anything happened for days.

This is not some technical exploit that bypasses your Mac. It is just deception, and your Mac cannot protect you from it on its own.

>>> Phishing
>>> How to spot a fake page
Before typing anything into a login form, check these:

**1. The URL.** Is the domain exactly right? Not close, exactly right. `roblox.com` is real. `roblox.co` is not. `roblox-verify.com` is not. Read the whole domain.

**2. How did you get here?** Clicked a link from a DM or email? Be extra careful. Typed the address yourself or used a bookmark? Much safer. Phishing pages depend on you arriving through a link they control.

**3. Does something feel off?** Fonts slightly different, buttons not lining up, something just looks slightly wrong? Trust that and go directly to the real site by typing the address yourself.

**4. Is it asking for something weird?** You are on what should be a script download page and it is asking for your Roblox username and password? Stop. No script site needs your Roblox login.

Common things that get faked:

| Fake page | What it steals |
|-----------|---------------|
| Discord login | Your Discord email and password |
| Roblox login | Your Roblox account |
| "Verify your account" page | Whatever you type in |
| Fake gate / key system page | Your credentials, or tricks you into installing something |
| "You won something" page | Personal info, sometimes payment details |

>>> Phishing
>>> The padlock does not mean the site is safe
The little lock icon in your browser means the connection between your Mac and the server is encrypted. Your data travels securely in transit.

It says nothing about whether the site on the other end is real.

Phishing sites have the padlock. A fake Discord login page built in an afternoon can have a perfect padlock. Getting one is free and automatic for any site.

The domain is the check. Not the padlock.

>>> Passwords
>>> Why your password is a problem
Two habits that cause the most account losses: reusing the same password across multiple sites, and using something easy enough to remember that it is also easy to crack.

The issue is that sites get breached constantly. Some database that has your email and password gets hacked, the list gets sold, and automated tools immediately try that combination on Discord, Roblox, Gmail, and everything else. One breach anywhere means every account sharing that password is at risk.

You can check if your email has already shown up in a known breach at **haveibeenpwned.com**.

>>> Passwords
>>> How to actually fix it
Use a password manager.

**Bitwarden** is the one to use. It is free, open source (independent people have reviewed the code), has a Mac app, and a browser extension that fills in passwords automatically.

```
1. Go to bitwarden.com and create an account
2. Download the Mac app and install the browser extension for Firefox
3. Set a master password, four random words you will remember
4. Save passwords as you log into things, Bitwarden will offer to save them
5. For important accounts, use the built-in generator to make a new random password
```

Your master password is the only one you memorize. Everything else is random and unique per site. If one site gets breached, that password is useless everywhere else.

For the master password, something like `coffee-lamp-tuesday-dog` is genuinely strong and easy to remember. Random words beat complicated passwords full of symbols you end up forgetting.

> Write your master password down on paper and put it somewhere safe at home. Do not store it on your phone or anywhere on a device. If you forget it, the vault is locked permanently. Bitwarden has no recovery for lost master passwords.

>>> Passwords
>>> Two-factor authentication
Two-factor authentication (2FA) means that even if someone gets your password, they cannot get into your account without a second code that only you have.

When you log in with 2FA enabled, you enter your password and then a 6-digit code that refreshes every 30 seconds. Without that code, the password alone does nothing.

Turn it on for these first:

| Account | Why |
|---------|-----|
| Email | Someone with your email can reset every other password. This one first. |
| Discord | Gets targeted constantly. 2FA on Discord also gives you backup codes. |
| Roblox | Gets stolen and sold regularly. 2FA stops most of it. |
| Bitwarden | It holds everything else. It needs protection too. |

On Mac, use **Raivo** (free on the App Store) as your authenticator app. It stores your 2FA codes and works offline. When a site asks you to set up 2FA, choose "authenticator app," scan the QR code it shows in Raivo, and from then on Raivo generates the codes for that site.

Skip SMS codes when you have the option. Texts can be intercepted through SIM swapping. App-based codes cannot.

> Every site gives you backup codes when you set up 2FA. Save them in Bitwarden or write them down. Lose your authenticator app with no backup codes and you can get permanently locked out of your own account.

>>> Discord
>>> How Discord accounts actually get stolen
Two main ways, both common.

**Phishing** is when you click a link, land on a fake Discord login page, type your info, and whoever made the page has your credentials. No 2FA means they are straight in.

**Token theft** is the one that 2FA does not stop.

Your Discord token is a long string of characters that Discord uses to keep you logged in. It lives on your Mac inside the Discord app's local files. Any program running on your Mac can try to read it. If something gets in and grabs that token, the attacker can access your account without your password or your 2FA code, because the token skips the login step entirely.

On Mac, the token lives at:

```
~/Library/Application Support/discord/Local Storage/leveldb/
```

You do not need to do anything with that path. Just know that anything you run on your Mac has access to it.

>>> Discord
>>> Token theft, what it looks like
Token grabbers get packaged as things people actually want:

- Nitro generators
- Script downloads packaged as a Mac app
- Executor downloads that are actually malware
- A tool someone in a DM says you need

On Mac they usually show up as a `.dmg` or `.pkg` file. You open it thinking you are installing something. What actually runs is a script that reads your Discord token, your browser cookies, and your saved passwords, then sends all of it to whoever made the file.

The whole thing takes a few seconds. You might see a fake "install failed" message so you think nothing happened.

**If you think you ran something like this:**

```
1. Open Discord in your browser, not the desktop app
2. Go to User Settings, then My Account
3. Change your password immediately
4. This invalidates the stolen token so they can no longer use it
5. Go to Settings, then Authorized Apps, and remove anything unfamiliar
6. Check whether any DMs went out from your account while you were not there
7. Tell your friends not to click anything your account may have sent them
8. Run a scan with Malwarebytes for Mac (the free version works fine)
```

Do this quickly. Once they have the token they will try to change your email and password to lock you out. The window to take your account back is short.

>>> Discord
>>> Safe habits on Discord
Things that cut out the majority of the risk:

- Turn on 2FA (Settings, My Account, Enable Two-Factor Auth)
- Check the URL before clicking any link from someone you do not know
- Do not download anything someone DMs you, even if the account looks real
- Set DMs to friends only (Settings, Privacy and Safety, turn off "Allow direct messages from server members")
- If a bot DMs you about your account, it is not from Discord. Discord does not contact you through bots in DMs.

>>> Downloads
>>> What to do before opening a file on Mac
Only download software from places you actually know and trust. The developer's own site, the Mac App Store, GitHub for open source tools with a known history. If you cannot trace a file back to a real source with a real reputation, do not run it.

macOS has Gatekeeper built in, which checks apps when you first open them. It catches known malware but it does not catch everything, especially newer stuff that has not been flagged yet.

**File types to be careful with on Mac:**

| File type | What it is |
|-----------|-----------|
| `.dmg` | Standard Mac disk image, but also how a lot of macOS malware gets delivered |
| `.pkg` | Package installer. Runs scripts during install and can do basically anything. |
| `.app` inside a zip | A Mac application |
| `.sh` | Shell script. Runs commands directly on your Mac. |
| `.command` | Same as a shell script, just double-clickable |

If someone sends you a "Lua script" and the download is a `.dmg` or `.pkg`, that is not a Lua script. A Lua script is a plain text `.lua` file or raw text you paste into your executor. It does not need an installer.

**When Mac warns you about a file:**

If it says "cannot be opened because it is from an unidentified developer," that does not automatically mean malware. Plenty of legitimate software is not in the App Store. But it does mean you should think before proceeding.

To open it anyway: System Settings, Privacy and Security, scroll down and you will see the blocked app with an Open Anyway button. Only do this if you actually know where the file came from.

If Mac says the file "cannot be opened because it is damaged," and it came from a random site, just delete it.

>>> Network Monitoring
>>> Little Snitch
Little Snitch is a network monitoring tool for Mac made by Objective Development, an Austrian company that has been building it for over 20 years. It sits between your Mac and the internet and shows you every connection attempt any app makes, in real time.

When an app tries to connect somewhere, Little Snitch shows you a prompt: the app name, the domain it is trying to reach, and the port. You can allow it once, allow it permanently, block it, or set a rule for that app going forward. Over time you build up a set of rules and the prompts mostly stop showing up.

It costs around $59 for a license. There is a free demo that gives you full functionality for 3 hours at a time, which you can restart as often as you want if you just want to get a feel for it.

**What it is actually useful for:**

You download something, it installs fine, looks normal. Then Little Snitch pops up and tells you that app is trying to connect to some random domain in a country you have never heard of. That is useful information you would never have otherwise.

It is also good for seeing the baseline: what is your Mac connecting to when you are not doing anything? The answer is usually more than you expect. Lots of system services, cloud syncs, update checkers. Some of it is fine, some of it you might want to block.

**What it cannot catch:**

Some apps make network requests through macOS system processes rather than directly, which means Little Snitch sees the system process making the connection instead of the app. It still logs it but attribution is sometimes ambiguous. Sandboxed App Store apps route traffic differently too.

Worth knowing so you are not confused when something shows up attributed to `configd` or a similar system process.

**Silent Mode:**

If the prompts get annoying, Silent Mode lets new connections through automatically but logs them all for review later. You go through the log, decide what to keep, and build your rules from there. That is the more comfortable way to use it if you do not want constant interruptions.

```
1. Buy or demo from obdev.at/products/littlesnitch
2. Install and approve the system extension when prompted (System Settings, Privacy and Security)
3. Allow the network filter when it asks
4. Start in Alert Mode to see what is happening
5. Switch to Silent Mode if the prompts are too frequent
6. Review the connection log and create rules for things you want to permanently allow or block
```

> Little Snitch is not a replacement for not running sketchy software. It is an extra layer of visibility. If you run something malicious, Little Snitch will show you the outbound connection, but by then the damage may already be done locally.

>>> VPN
>>> What a VPN actually does
A VPN reroutes your internet traffic through a server somewhere else before it reaches the site you are visiting. From the outside, it looks like the request is coming from the VPN server, not your Mac.

That is the whole thing. It moves where your traffic is visible from. It does not make it disappear.

| What it does | What it does not do |
|--------------|-------------------|
| Hides your traffic from your ISP | Hide you from sites you are logged into |
| Changes your IP address | Stop cookies or tracking pixels |
| Encrypts traffic between your Mac and the VPN server | Protect you from phishing |
| Lets you look like you are in a different country | Stop fingerprinting |
| Helps on public Wi-Fi | Make you anonymous |

If you are signed into Google while using a VPN, Google still knows exactly what you are doing. The VPN just means your internet provider does not.

>>> VPN
>>> When a VPN is actually useful
**Worth turning on:**

- On public Wi-Fi at coffee shops, airports, or hotels. Everything is encrypted before it leaves your Mac so the network operator sees nothing useful.
- When you do not want your ISP seeing which sites you visit.
- Getting around region locks on content.
- Hiding your IP from a specific site or game server.

**Where a VPN does not help:**

- Being tracked while you are logged into any account
- Hiding from ad tracking that uses fingerprinting
- Actual anonymity online
- Protecting against malware or phishing

> Paying for a VPN and staying signed into Chrome with your Google account does almost nothing for your privacy. The VPN helps in specific situations, it is not a general solution.

>>> VPN
>>> Which VPN to use
A VPN provider can see all your traffic. You are moving trust from your ISP to them. A bad VPN provider is worse than no VPN because you think you are covered when you are not.

**Worth using:**

| VPN | Why |
|-----|-----|
| **Mullvad** | No accounts, no email, you pay with a random code. They genuinely do not know who you are. Audited, flat rate, best option for actual privacy. |
| **ProtonVPN** | Made by the ProtonMail team. Free tier is legitimate. Based in Switzerland. No logs, open source, audited. |
| **IVPN** | Similar to Mullvad. Privacy-focused, accepts cash and crypto. Audited. |

**Skip these:**

| VPN | Why |
|-----|-----|
| Any free VPN that is not ProtonVPN | Free VPNs make money somehow. It is usually your data. |
| NordVPN | Had a server breach they did not tell users about for over a year. Owned by a holding company with a messy history. |
| ExpressVPN | Acquired by Kape Technologies, a company with a history of distributing malware. Their former CEO was connected to a UAE government surveillance operation. |
| Hola VPN | Not a VPN. Routes your traffic through other users' computers and turns you into an exit node for strangers. |
| OperaGX built-in VPN | It is a proxy, not a VPN. Opera is owned by a Chinese company and traffic routes through their servers. |
| Surfshark and CyberGhost | Both owned by Kape Technologies, same concerns as ExpressVPN. |

The ones worth using spend almost nothing on marketing. Mullvad and ProtonVPN grow through word of mouth from people who actually know this stuff. The ones with massive YouTube ad budgets need to make that money back somehow.

>>> VPN
>>> VPNs and key systems
Running a VPN through a key system or gate page will usually break it. A lot of those systems check your IP and flag VPN exit nodes specifically.

If a key system is not working and you have a VPN on, turn it off and try again. That is usually the cause. Gate pages are not doing anything sensitive enough to need VPN protection anyway.

>>> VPN
>>> Setting up Mullvad on Mac
```
1. Go to mullvad.net
2. Click "Generate account", no email or name needed
3. You get a random account number, save it somewhere safe
4. Add time to the account with a card, crypto, or cash
5. Download the Mullvad app for macOS
6. Open it and enter your account number
7. Click Connect
```

The app lives in your menu bar. Click it to connect or disconnect and pick which country the server is in from the same menu.

One setting worth enabling: open Mullvad, Settings, VPN settings, and turn on "Block internet when disconnected from VPN." This is the kill switch. If the VPN drops unexpectedly, your Mac blocks all traffic instead of falling back to your real IP without you noticing.

>>> Public Wi-Fi
>>> What is actually a problem
Coffee shop, airport, hotel Wi-Fi. Riskier than home, but not in the way people usually picture it.

Because almost everything uses HTTPS now, someone else on the same network cannot read what you are sending. They can see you are connecting to Discord but not what you are typing. Your password is not just sitting there exposed.

The actual risks:

**Evil twin networks.** Someone creates a hotspot with the same name as the real one. You connect to theirs instead. They can see which sites you are visiting and catch anything that is not encrypted.

**Captive portals.** The login screen that pops up when you first connect to hotel or airport Wi-Fi could itself be tampered with. Do not enter anything real into those pages beyond what you need to get online.

A VPN on public Wi-Fi is one of the situations where it genuinely earns its keep. It wraps everything before it leaves your Mac, including DNS requests, so the network operator sees nothing.

>>> Mac Settings
>>> Built-in stuff worth turning on
macOS has some privacy settings worth checking. Most people never look at them.

**System Settings, Privacy and Security:**

| Setting | What to do |
|---------|-----------|
| Location Services | Turn off for any app that does not actually need your location |
| Microphone | Check which apps have access. Remove anything that should not be there. |
| Camera | Same as microphone |
| Full Disk Access | Only give this to apps that genuinely need it. Very few do. |
| Screen Recording | Check the list and remove anything you do not recognize |

**System Settings, General, Sharing:**

Turn off everything you do not actively use. File Sharing, Remote Login, Remote Management. Worth confirming these are off.

**Firewall:**

System Settings, Network, Firewall, turn it on. Blocks unexpected incoming connections. Does not affect normal browsing but adds a layer on shared networks.

**FileVault:**

System Settings, Privacy and Security, FileVault. Turn it on if it is not already. FileVault encrypts your entire drive. If your Mac gets stolen, the thief cannot read your files without your password. On Macs with Apple Silicon this has no real performance impact.

> FileVault is only as strong as your login password. Make it a real one. Use the password manager.

>>> More
>>> What this does not cover
This doc covers browsers, link safety, phishing, passwords, 2FA, Discord security, Mac downloads, network monitoring, VPNs, and basic Mac settings.

Things that go beyond what is here:

- Router and network setup at home
- Email privacy (aliases, private providers)
- iPhone privacy settings
- More advanced Mac hardening

Getting everything in this doc right is a solid foundation. The basics done consistently beat advanced stuff done once and forgotten.