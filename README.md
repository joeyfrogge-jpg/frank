# FRANK — AI Video Generator

Turn your ideas into videos. Premium dark UI · text-to-video via [Puter.js](https://docs.puter.com/) · no Hugging Face token required.

**Live:** https://joeyfrogge-jpg.github.io/frank/

## Features

- **Prompt → video** with Puter AI models (Wan / Seedance and more)
- **Reference images** (image-to-video) via Add Reference
- **Quick Create:** From Photo, From Text, AI Magic
- **Library** — private videos stored on your device (IndexedDB)
- **Recent Creations** — empty until you generate something real
- **Explore** — optional shared public feed (Supabase)
- **Settings** — duration (5–60s), format, Puter sign-in

## How to use

1. Open the site and allow **Puter** sign-in when prompted (User-Pays credits).
2. Write a prompt (or pick a chip / Quick Create).
3. Optionally **Add Reference** photos.
4. Tap the purple **→** button to generate.
5. Videos save to **Library** on this device.

## GitHub Pages

1. Repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main** / **/** (root)
4. Save — site at `https://joeyfrogge-jpg.github.io/frank/`

## Explore (optional shared feed)

Without Supabase, Explore stays empty (no fake posts).

1. Create a free [Supabase](https://supabase.com) project.
2. SQL Editor — run:

```sql
create table frank_explore (
  id text primary key,
  prompt text,
  caption text,
  video_url text not null,
  creator text,
  created_at timestamptz default now()
);
alter table frank_explore enable row level security;
create policy "public read" on frank_explore for select using (true);
create policy "anon insert" on frank_explore for insert with check (true);
```

3. In the app **Settings**, paste Project URL + anon key.
4. Use **Share to Explore** after generating a video.

## Stack

- Static single-page app (`index.html`)
- [Puter.js](https://js.puter.com/v2/) for video generation
- IndexedDB for private library
- Optional Supabase REST for public Explore

## Related

Also on Reel Riot: https://joeyfrogge-jpg.github.io/reelriot/
