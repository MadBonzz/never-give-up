# never give up

A small wall of internet finds. Open `index.html` to browse. Click an image to enlarge it and see its source. Press Escape to get back to the wall.

## Deploy

- **GitHub Pages** — In the repository’s [Pages settings](https://github.com/MadBonzz/never-give-up/settings/pages), select **Deploy from a branch**, choose **main** and **/ (root)**, then save.
- **Vercel** — Import this repository, choose the **Other** framework preset, leave the build command empty, and deploy from the repository root.

## Add a find

Open [the submission page](https://never-give-up-red.vercel.app/submit/), paste a public X or Twitter post link, and choose **add to the wall**. A post imports every attached photo. A link ending in `/photo/2` imports just that attachment. Already-added photos are skipped.

On your first new submission, open **Publishing access** and follow the link to create a fine-grained GitHub token. Choose **Only select repositories → MadBonzz/never-give-up** and **Contents → Read and write**. Paste the token into the form. **Remember on this device** is optional. The browser sends the token directly to GitHub. The extractor only handles public post IDs and photo filenames. The images and gallery update are published together in a single commit to `main`.

Vercel runs the public X photo extractor in `api/x-post.mjs` without any API keys. The GitHub Pages submission form uses that same Vercel endpoint.

To add a find by hand, save the image in `images/`. Copy an existing link inside `.wall` in `index.html`. Update its source URL, `data-credit`, image path, dimensions, and alt text. The random button picks from those same links.

Images link back to the posts or collections where they were found. The layout was inspired by [Jack Friks’ keep going](https://www.jackfriks.com/keep-going).
