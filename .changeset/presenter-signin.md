---
"@kadal/deck": minor
---

The presenter gate follows the host: when it says the deck has no passcode (`passcode: false`) the
gate stops asking for one, and when it gives a `signIn` URL it offers "Sign in as the author" —
on its own, or below the passcode field. Only http(s) links are followed.
