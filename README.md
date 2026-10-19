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

- Fill 2 to 8 chairs: Singer, Guitar, Bass, Drums, and optional Keys, Horns, DJ, and Strings. One person per chair. Swap or remove from the chair, or replace them from the pool.
- Browse a starter pool of well-known musicians across rock, soul and R&B, jazz, funk, metal, pop, hip-hop, country, punk, electronic, and classical. Search by name and filter by role.
- Add a custom player with a name, a role, and general style traits.
- **Imagine a song.** The same lineup and seed always produce the same sheet: band name, title, genre blend, tempo, key, meter, full structure, chords, a contrasting bridge, liner notes, and original lyrics lined up with each section.
- **Reroll** picks a new seed.
- Edit the song on the sheet: tempo, key, meter, the chords and lyrics of each section, and the section order. Undo, redo, or reset to the original imagined song. Edits are saved in the share link when they fit, and compressed when that keeps the link shorter. A link that would be too long still opens the original imagined song.
- **Play** the full arrangement, about two to four minutes: drums, bass, chords, and a lead melody standing in for the vocal. Horns, turntables, and strings are synthesized only when that chair is filled. Mute any part. A progress bar marks each section, you can jump to a section, and you can loop the section under the playhead. Nothing is sung.
- A mixer gives each filled chair volume, pan, mute, solo, tone, and a send to a shared synthesized reverb, plus a master volume and limiter. The mix is saved with the song, written into the WAV, and volume and pan go out as MIDI controllers. Instruments are still synthesized — no recordings of real instruments.
- Each song gets a procedural album cover from the seed and genre. Download it as a PNG, download a MIDI file with one track per part, or render the arrangement to a WAV in the browser.
- Save favorite songs in this browser. Copy a share link that encodes the lineup and seed in the URL.

An optional check of the generator (not required to run the app):

```bash
node scripts/check.mjs
```

## Roadmap

- Optional AI music generation behind a server, using original voices only
- Community sharing

## Fonts

Fraunces and Outfit are included under the [SIL Open Font License](fonts/OFL.txt).
