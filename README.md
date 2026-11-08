# RSVP Desk – Attendance confirmation tool

Upload a list of names, send each person a personal attendance email with **YES, I WILL ATTEND** / **NO, I CANNOT ATTEND** buttons, and watch responses arrive on a live dashboard.

## How it works

| Part | Where it lives | What it does |
|---|---|---|
| Dashboard (`index.html`, `styles.css`, `app.js`) | GitHub Pages | The website you use: import names, edit the email, send, track responses, export to Excel. |
| Backend (`backend/Code.gs`, `backend/Response.html`) | Google Apps Script, attached to a Google Sheet | Sends the emails from your Google account, stores the guest list in the Sheet, and records each YES/NO click. |

**No passwords or API keys are on GitHub.** Emails are sent through your own Google account, and the dashboard is protected by an admin key that only exists in your Apps Script project and your own browser.

Each guest gets a unique, unguessable link, so every response is matched to the right person. When they click YES or NO, a small page opens and they tap once more to confirm. That extra tap stops university email scanners (which open links automatically) from answering for people.

---

## Setup (about 15 minutes, no coding)

### 1. Create the backend

1. Go to [sheets.new](https://sheets.new) to make a new Google Sheet. Name it something like “Attendance – My Event”.
2. Click **Extensions → Apps Script**.
3. Delete everything in `Code.gs`, then paste in the contents of `backend/Code.gs` from this project.
4. Click the **+** next to Files → **HTML**, name it `Response` (exactly), and paste in the contents of `backend/Response.html`.
5. Click **Save** (💾).
6. In the function dropdown at the top choose **setup**, then click **Run**.
   - Google will ask for permission. Click **Review permissions**, choose your account, then **Advanced → Go to (project) → Allow**. (This warning appears for every personal script.)
7. Open **View → Logs** (or the Execution log at the bottom). Copy your **admin key**. Keep it private.

### 2. Publish the backend

1. Click **Deploy → New deployment**.
2. Click the gear ⚙️ next to “Select type” → **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**. (“Anyone” is needed so guests can click their links without a Google login. The dashboard actions still require your admin key.)
4. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).

### 3. Put the dashboard on GitHub

1. Create a new repository on GitHub (it can be public, since there are no secrets in it).
2. Upload `index.html`, `styles.css`, `app.js` and this `README.md`. You can also upload the `backend` folder for safekeeping.
3. Go to **Settings → Pages**, set **Source: Deploy from a branch**, branch **main**, folder **/ (root)**, and **Save**.
4. After a minute your dashboard is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

### 4. Connect

Open your dashboard, go to **Setup**, paste the **Web app URL** and **admin key**, and click **Connect**. These are saved only in that browser. Do this once on each device you use.

---

## Using it

1. **Add people.** Upload an Excel/CSV file (a “Name” column, or “First name” and “Last name” columns, or just names in the first column) or paste names, one per line. “Smith, John” also works. Emails are generated as `FirstName.LastName@edu.escp.eu`, with accents removed (José → Jose) and multi-part last names joined by hyphens (Álvarez García → Alvarez-Garcia). Red tags must be fixed (invalid, duplicate, already on list); yellow tags are worth a check.
2. **Email & send.** Set the event name, subject and message. Use `{firstName}`, `{eventName}` and `{organisation}` to personalise. Send yourself a test, tick the approval box, and send.
3. **Dashboard.** Statuses update automatically every 15 seconds: ✓ Confirmed (green), ✕ Declined (red), ◷ Pending (grey). Filter, search, change a status manually (for example if someone replies by email), and export to Excel.
4. **Reminders.** “Resend to pending” emails only people who were emailed but haven’t replied, and skips anyone emailed in the last hour.

## Duplicate protection

- The same email address can’t be added twice.
- “Send” only emails people who have never been emailed.
- “Resend” only emails people still pending, with a 1-hour cooldown.
- Sending runs one batch at a time, so double-clicking can’t send twice.

## Limits to know

- Google’s daily sending limit is about **100 emails/day for a free Gmail account** and about **1,500/day for Google Workspace**. The dashboard shows how many you have left; if you hit the limit, press Send again the next day and it continues where it stopped.
- One send can run for about 5 minutes (roughly 300–500 emails). For larger lists just press Send again; nobody is emailed twice.
- Emails come from the Google account that deployed the backend. Set **Replies go to** if you want replies to land in your ESCP inbox.
- If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version** so the URL stays the same.

## Your data

The guest list lives in the **Guests** tab of your Google Sheet. You can open it at any time. To start a new event, make a copy of the Sheet (Apps Script comes with it) and repeat steps 1–2, or clear the Guests rows.
