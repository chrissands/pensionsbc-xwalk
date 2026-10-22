# Uploading a site's images to AEM Assets

Images go into AEM Assets **before** the site's pages are pushed. The imported pages reference the
images by their exact DAM path, so the push button only links to them; it never uploads images itself.
That avoids its known problems: images not processed in time, lost alt text, and mixed-up files.

Each site has a zip in this folder. It holds the images already named and sorted into the DAM folder
structure:

```
pensionsbc-base/
  <site>/     images used only by that site
  shared/     images used by several sites (plan logos, icons, all-plans promos)
```

Everything below `pensionsbc-base/` maps 1:1 to `/content/dam/pensionsbc-base/` in AEM.

## College: `college-images.zip`

| AEM folder | Files |
|---|---|
| `/content/dam/pensionsbc-base/college/` | `annual-report-2025.jpg`, `board-message-2025.jpg`, `college-pension-plan-logo.png`, `hero-mountain-meadow.jpg` |
| `/content/dam/pensionsbc-base/shared/` | `learn-about-my-pension.jpg`, `message-centre-icon.png`, `mpp-logo.png`, `pension-life-summer-2026.jpg`, `pspp-logo.png`, `tpp-logo.png`, `worksafebc-logo.png`, `youtube-logo.png` |

`shared/` already exists: the first corporate package put `bc-pension-corporation-logo.jpg` and
`bci-logo.png` there. Leave those two as they are.

## Steps

1. **Download** the zip from GitHub: open the file on the site's branch, click **Download raw file**,
   and unzip it on your computer.
2. **Open AEM Assets** on author:
   `https://author-p129103-e1259800.adobeaemcloud.com/assets.html/content/dam/pensionsbc-base`
3. **Create the site folder** if it doesn't exist: **Create → Folder**, Title `college`, Name `college`.
   The name must be exactly the lowercase folder name from the zip; it becomes the path.
4. **Upload the site's images:** open the `college` folder, then drag all files from the unzipped
   `pensionsbc-base/college/` folder onto the page (or **Create → Files**), and click **Upload**.
   Keep the file names exactly as they are. If AEM offers to rename a file or create a version,
   choose **Replace** for a re-upload; otherwise keep the name.
5. **Upload the shared images:** open `shared`, drag in all files from `pensionsbc-base/shared/`, and
   click **Upload**.
6. **Wait for processing:** every image should show a thumbnail and no "Processing" badge. This usually
   takes a minute or two. Only then push the pages.
7. **Check one path:** select `college-pension-plan-logo.png` and choose **Properties**. The path
   should be `/content/dam/pensionsbc-base/college/college-pension-plan-logo.png`.

## For the partner

`tools/importer/dam-assets.js` maps each source image to its DAM path; the importers write that path
into the pages. To add a site: collect its images, name them in kebab-case, add them to the site's zip
and to `dam-assets.js`, upload, then re-import and push.
