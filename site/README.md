# hibi site

The documentation site at https://hibi.pages.dev. Next.js with static export: every page is rendered to HTML at build time, and only the terminal demos, the table of contents and the copy buttons run JavaScript.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # writes the static site to out/
```

English lives at `/` and Portuguese at `/pt`. Text for both is in `src/content/`. The terminal demos in `src/components/terminal/` reproduce the CLI's real layout, so when the CLI's output changes, update `engine.ts` and `markdown.ts` to match.

Deploy on Cloudflare Pages with root directory `site`, build command `npm run build` and output directory `out`.
