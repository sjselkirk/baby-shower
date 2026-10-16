# Guess the Baby 👶

A live baby shower quiz. Guests scan a QR code, type their name and vote on their phones.
The host screen shows each question, a live answer count, the winning answer, and at the end
a cute illustrated baby built from the most popular answers (plus everyone's own babies).

It is plain static files, so it runs on GitHub Pages with no server or sign-ups.
Phones and the host screen talk through a free public message relay (broker.emqx.io,
falling back to broker.hivemq.com), so guests can be on wifi or mobile data.

## On the day

- On the laptop connected to the TV/projector, open `https://YOUR-USERNAME.github.io/baby-shower/#host`.
- Guests scan the QR code. Their names pop up on the screen.
- To run it from your phone, click **Phone remote** (bottom right) before guests arrive and scan that code
  with your own phone. Don't let guests scan it: it controls the game.
- Click **Start the quiz**. When everyone has answered, click **Reveal answers**, then **Next question**.
- After the last question click **Meet our baby!**. Then click **Name the baby** and guests type a name idea on their
  phones; the names pop up around the baby (no voting). **Back to our baby** returns, and **See everyone's babies** shows each guest's own baby.
- If it's a tie, click the answer you want to win.
- Refreshing the host page or a phone is safe: the game picks up where it was.
- **New game** (bottom right) wipes everything and makes a new QR code. Do one practice run with a
  couple of phones beforehand, then press New game before guests arrive.

## Changing the questions

Edit `questions.js` (on GitHub: open the file, click the pencil, edit, **Commit changes**).
Each answer can change how the baby looks with `baby: { eyes: "green" }` etc.; the options are
listed at the top of that file.
