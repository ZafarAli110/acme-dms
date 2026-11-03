# Prototypes

When a ticket adds a screen, or a new part of one, and nothing says how it looks, the `implement-ticket` skill draws two
or three static prototypes here before any UI code: `docs/prototypes/<KEY>/a.html`, `b.html`, `c.html`. Plain HTML in
the app's look, with the real labels and sample rows, nothing wired up; each differs in one real choice, named in a
comment at its top. The product owner picks one; the pick is recorded in the plan's Design and Decisions. Open a file in
a browser to see it.

A ticket that carries its own design (an image, a screenshot, a Figma link), or that follows an existing screen,
needs none.
