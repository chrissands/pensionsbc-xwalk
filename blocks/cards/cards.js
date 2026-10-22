import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

// card style values (the card model's "variant" field), added to the card as cards-card-<value>
const VARIANTS = ['highlight'];
const YOUTUBE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

/**
 * Tiles: a paragraph holding only a YouTube link becomes an embedded player (privacy-enhanced
 * domain, loaded lazily); the link text is the player's accessible title.
 */
function embedVideos(ul) {
  ul.querySelectorAll('.cards-card-body p').forEach((p) => {
    const link = p.querySelector(':scope > a[href]');
    const id = link && p.children.length === 1 && link.href.match(YOUTUBE)?.[1];
    if (!id) return;
    const frame = document.createElement('div');
    frame.className = 'cards-card-video';
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    iframe.title = link.textContent.trim();
    iframe.loading = 'lazy';
    iframe.allow = 'encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    frame.append(iframe);
    p.replaceWith(frame);
  });
}

export default function decorate(block) {
  /* change to ul, li */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    moveInstrumentation(row, li);
    while (row.firstElementChild) li.append(row.firstElementChild);
    const cells = [...li.children];
    cells.forEach((div) => {
      const value = div.textContent.trim();
      const hasImage = div.querySelector('picture, img');
      if (!hasImage && (VARIANTS.includes(value) || (!value && cells.length > 2))) {
        // card style cell, or an empty image / style cell: a class, not content
        if (value) li.classList.add(`cards-card-${value}`);
        div.remove();
      } else if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    // only same-origin (media bus) images can be resized; external images are kept as they are
    if (new URL(img.src, window.location.href).origin !== window.location.origin) return;
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  if (block.classList.contains('tiles')) {
    embedVideos(ul);
    // icon-sized images (2x assets up to 120px wide) sit beside the heading at half size
    ul.querySelectorAll('.cards-card-image img').forEach((img) => {
      const mark = () => {
        if (img.naturalWidth && img.naturalWidth <= 120) img.closest('li').classList.add('cards-card-icon');
      };
      if (img.complete) mark(); else img.addEventListener('load', mark, { once: true });
    });
  }
  block.textContent = '';
  block.append(ul);
}
