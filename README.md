# Bandmatch

Assemble a fantasy supergroup of real musicians. Bandmatch imagines an original song that lineup might make, writes a one-page song sheet, and plays a full synthesized arrangement in the browser.

Songs are imagined and original. They are not real recordings, and the named artists are not involved. The app does not imitate a real voice and does not reproduce real lyrics or melodies.

There is no server, no account, and no API key. The page is static HTML, CSS, and JavaScript, so it can be hosted on GitHub Pages from `main` with no build step.

## Run locally

From this folder:

```bash
python3 -m http.server
```

Open the URL it prints, usually [http://localhost:8000](http://localhost:8000). A local server is required because the page loads JavaScript modules. Opening `index.html` directly will not work.

## What v1 does

- Fill 2 to 5 chairs: Singer, Guitar, Bass, Drums, and optional Keys. One person per chair. Swap or remove from the chair, or replace them from the pool.
- Browse a starter pool of well-known musicians across rock, soul and R&B, jazz, funk, metal, pop, hip-hop, country, and punk. Search by name and filter by role.
- Add a custom player with a name, a role, and general style traits.
- **Imagine a song.** The same lineup and seed always produce the same sheet: band name, title, genre blend, tempo, key, meter, full structure, chords, a contrasting bridge, liner notes, and original lyrics lined up with each section.
- **Reroll** picks a new seed.
- **Play** the full arrangement, about two to four minutes: drums, bass, chords, and a lead melody standing in for the vocal. Mute any part. A progress bar marks each section, you can jump to a section, and you can loop the section under the playhead. Nothing is sung.
- Save favorite songs in this browser. Copy a share link that encodes the lineup and seed in the URL.

An optional check of the generator (not required to run the app):

```bash
node scripts/check.mjs
```

## Roadmap

- More chairs, such as horns or DJ
- MIDI export
- A richer band-name studio and an album-art generator
- Optional AI music generation behind a server, using original voices only
- Community sharing

## Fonts

Fraunces and Outfit are included under the [SIL Open Font License](fonts/OFL.txt).
