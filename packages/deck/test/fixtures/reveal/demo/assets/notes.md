## External Markdown

Slides can live in a Markdown file of their own.

- Loaded with `data-markdown="assets/notes.md"`
- Split on a line of three dashes

Note: These notes come from the external file.

---

## A second external slide

```js [1|3-4]
const deck = await load("notes.md");

deck.slides.forEach((slide) => {
  render(slide);
});
```
