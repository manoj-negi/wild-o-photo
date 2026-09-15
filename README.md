# Of Wild & Walls

# test

Photography portfolio, merged with its admin panel into one Express + TypeScript app.

- **`/`** — Flow view (photos scattered on a scrolling canvas)
- **`/grid`** — Grid view (horizontal filmstrip)
- **`/photo/:slug`** — photo detail page
- **`/admin`** — admin panel (photo + category management), redirects to `/admin/photos`

## Run

```bash
npm install
npm run dev     # tsx watch, http://localhost:3000
```

```bash
npm run build   # tsc -> dist/
npm start        # node dist/server.js
```

## Structure

```
src/
  server.ts          app setup, mounts the two routers, static + view roots
  routes/site.ts      /, /grid, /photo/:slug
  routes/admin.ts      all /admin/* routes (photos + categories CRUD)
  data/                typed in-memory data (site photos, cameras, details,
                       admin photos, categories) — swap for a real store later
  types/               shared TS interfaces for site + admin data
views/
  site/                Flow/Grid/Detail EJS templates + partials
  admin/               admin EJS templates + partials
public/
  site/img, site/js     site static assets (images, app.js)
  admin/js              admin static assets (admin.js)
uploads/               pasted images from the design tool (not wired up)
preview/                 static HTML previews of Flow/Grid, open directly in a browser
_ds/, .thumbnail        design-tool artifacts, not used by the app
README.site.md, README.admin.md   original per-folder notes, kept for reference
```

Both `views/site` and `views/admin` are registered as view roots, and both
`public/site` and `public/admin` are served as static roots — filenames don't
collide (`app.js` vs `admin.js`), and photo images live under `public/site/img`,
which both the site and the admin panel's `<img src="/img/...">` tags resolve to.

## Notes

- Tailwind runs from the CDN, configured separately per layout in each
  `partials/head.ejs` (site: paper/ink/night; admin: pine/amber/cream).
- Admin data is in-memory (`src/data/admin-photos.ts`, `src/data/categories.ts`)
  and resets on restart — same as before the merge, just typed now.
- Site data (`src/data/site-photos.ts`, `cameras.ts`, `details.ts`) drives the
  public pages independently of the admin store; wiring the admin CRUD to
  actually publish onto the live site is the natural next step once you add
  a real database.
