/**
 * Hero block. The panel style is a box of links over the image: its links stay plain text
 * links rather than buttons.
 * @param {Element} block The hero block element
 */
export default function decorate(block) {
  if (!block.classList.contains('panel')) return;
  block.querySelectorAll('.button-container').forEach((p) => p.classList.remove('button-container'));
  block.querySelectorAll('a.button').forEach((a) => a.classList.remove('button', 'primary', 'secondary'));
}
