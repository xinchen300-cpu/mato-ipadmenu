# Automaat Menu

Your own digital menu for the vending machine: you edit it on the computer, and it shows on an iPad next to the machine.
Customers tap a product to see the photo or video, description, allergens, ingredients and the
**slot number to type on the keypad**. Each handelaar (vendor) gets their own fonts and colours.

- **Display (iPad):** `https://<your-site>/`
- **Admin (computer):** `https://<your-site>/admin`, protected by a password

## How it runs online

The website is plain files (the `public/` folder) on Vercel. The menu, photos and videos are stored
in the Supabase project **vendly**, completely separate from vendly's own data:

| In Supabase                     | What it is                                                         |
|---------------------------------|--------------------------------------------------------------------|
| table `menu_document`           | the whole menu as one JSON document; anyone may read it            |
| schema `menu_private`           | admin password (hashed), login sessions, daily backups (60 days)  |
| functions `menu_login`, `menu_save`, `menu_logout`, `menu_change_password`, `menu_session_ok` | the only way to change anything |
| bucket `menu-media`             | uploaded photos and videos (max 50 MB each on the free plan)      |
| edge function `menu-upload`     | hands out a one-time upload link, only to someone who is logged in |

The setup is in `supabase/migrations/20261021_automaat_menu.sql` and `supabase/functions/menu-upload/`.
`public/config.js` holds the Supabase address and *publishable* key. That key is public by design:
it can read the menu, but only someone with the password can change it.

The iPad checks for changes every 10 seconds. If the wifi drops, it keeps showing the last menu it loaded.

### Publishing or updating the website

The code lives on GitHub (`xinchen300-cpu/mato-ipadmenu`) and Vercel publishes it:

1. In Vercel: *Add New → Project*, import `mato-ipadmenu`, and click *Deploy*. No settings are needed:
   `vercel.json` tells Vercel the website is in `public/` and that there is nothing to build.
2. Every change pushed to the `main` branch goes live automatically.

Menu changes made in the admin never need a new deployment, only code changes do.
Any static host works too: Netlify Drop or Cloudflare Pages just need the `public` folder
(`public/_redirects` handles `/admin` there).

### First time

Until the menu has been saved online once, the site shows the starter menu from `public/seed.json`.
The first change you save in the admin creates the online menu.

## Setting up the iPad as a kiosk

1. Open the display URL in **Safari**, then Share → **Add to Home Screen**. It opens full screen, with no browser bars.
2. Settings → Display & Brightness → **Auto-Lock: Never**.
3. Settings → Accessibility → **Guided Access**: turn it on. Open the app and triple-click the
   side/home button, so customers can't leave the menu.
4. Keep it on the charger.

If nobody touches the screen, it returns to the start screen after 60 seconds. After
120 seconds it starts a slideshow of product photos. Both times are set in *Startscherm & instellingen*.

## Running it on your own computer instead (optional)

With [Node.js](https://nodejs.org) 18 or newer, `node server.js` runs everything locally. The menu, photos and
backups then live in `./data`, and the online settings are ignored. On first start it prints the admin login
(`admin` and a generated password, also saved in `data/admin-password.txt`). Settings: `PORT` (3000),
`DATA_DIR` (`./data`), `ADMIN_USER`, `ADMIN_PASSWORD`.

## About the starter content

The starter menu (`public/seed.json`) was built from screenshots of the old mydigimenu setup:

- It has **no photos**. Upload your originals in the admin.
- Names cut off in the screenshots were guessed: *Bretoense Aardbei*, *Bretoense Framboos*,
  *Kaastaart Rood Fruit & Speculoos*. Check them.
- **Allergens for Julie's products are empty on purpose.** Fill them in with the real information.
- *Voorbeeld: De Zuivelhoeve* is a made-up example vendor, there to show a second theme. Delete it whenever you like.

## Removing it from Supabase

```sql
drop schema menu_private cascade;
drop table public.menu_document;
drop function public.menu_session_ok, public.menu_login, public.menu_logout,
  public.menu_change_password, public.menu_save;
```

Then delete the edge function `menu-upload` and empty and delete the bucket `menu-media` in the dashboard.

## Files

```
public/index.html        iPad display
public/display.js|css    display logic and layout
public/admin/            admin panel
public/backend.js        talks to Supabase (online) or to server.js (local)
public/config.js         Supabase address and publishable key
public/shared.js         allergens, fonts, theme presets
public/sw.js             offline cache for the display
public/seed.json         starter menu
supabase/                database setup and upload function
vercel.json              tells Vercel to publish public/ as it is
server.js                optional local server (no dependencies)
```
