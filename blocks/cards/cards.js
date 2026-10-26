import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

// card style values (the card model's "variant" field), added to the card as cards-card-<value>
const VARIANTS = ['highlight'];
// styles whose links are text links, not buttons (in resources the last link covers the card)
const PLAIN_LINKS = ['featured', 'links', 'link-list', 'events', 'resources'];
const YOUTUBE = /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;

/**
 * Tiles: a paragraph holding only a YouTube link becomes a video: the video's thumbnail with a play
 * button, replaced by the player (privacy-enhanced domain) when pressed. YouTube is only contacted
 * for the player once the visitor asks for it, so the page sets no third-party cookies. The link
 * text is the button's and the player's accessible name.
 */
function embedVideos(ul) {
  ul.querySelectorAll('.cards-card-body p').forEach((p) => {
    const link = p.querySelector(':scope > a[href]');
    const id = link && p.children.length === 1 && link.href.match(YOUTUBE)?.[1];
    if (!id) return;
    const name = link.textContent.trim();
    const frame = document.createElement('div');
    frame.className = 'cards-card-video';
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'cards-card-video-play';
    play.setAttribute('aria-label', name);
    const thumbnail = document.createElement('img');
    thumbnail.src = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    thumbnail.width = 1280;
    thumbnail.height = 720;
    // not every video has a full-size thumbnail
    thumbnail.addEventListener('error', () => { thumbnail.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }, { once: true });
    play.append(thumbnail);
    play.addEventListener('click', () => {
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;
      iframe.title = name;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      frame.replaceChildren(iframe);
      iframe.focus();
    }, { once: true });
    frame.append(play);
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
      if (!hasImage && (VARIANTS.includes(value) || (!value && cells.length > 1))) {
        // card style cell, or an empty cell (no image, no style): a class or nothing, not content
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
    // cards are up to ~610px wide: 1500px keeps them sharp on 2x screens (small images stay small)
    const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 600px)', width: '1500' },
      { width: '750' },
    ]);
    moveInstrumentation(img, optimizedPic.querySelector('img'));
    img.closest('picture').replaceWith(optimizedPic);
  });
  if (PLAIN_LINKS.some((c) => block.classList.contains(c))) {
    ul.querySelectorAll('.button-container').forEach((p) => p.classList.remove('button-container'));
    ul.querySelectorAll('a.button').forEach((a) => a.classList.remove('button', 'primary', 'secondary'));
  }
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
