# Team photographs

The photographs of the people on `/about-us` go in this folder.

One file for each person, named after them, e.g. `ben-smith.jpg`. Then point
`src/data/team.ts` at it:

```ts
photo: '/assets/img/team/ben-smith.jpg',
```

What the photograph needs to be:

- A real photograph of that person. A phone camera against a plain wall is
  enough. **No stock photographs** — the page carried three invented people
  with stock faces until 11 October 2026 and that is the mistake being fixed.
- Roughly square, at least 600 x 600 pixels, JPEG.
- A little space around the head. The page crops each photograph to a circle.

Nothing shows on the About page until a person is listed in `src/data/team.ts`,
so an unused file in here is harmless.
