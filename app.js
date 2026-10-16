// Guess the Baby: live quiz for a baby shower.
// The host page (your laptop / the big screen) is the source of truth.
// Phones and the host talk through a free public MQTT broker over secure websockets,
// so the whole site is just static files (works on GitHub Pages).
(function () {
  "use strict";

  const QUIZ = window.QUIZ;
  const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
  const TOPIC = (room) => "guess-the-baby/v1/" + room + "/";
  const LETTERS = "ABCDEFGH";
  const params = new URLSearchParams(location.search);
  const customBroker = params.get("bk"); // for testing with your own broker
  const $app = document.getElementById("app");
  const $conn = document.getElementById("conn");

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const rid = (n, abc) => { abc = abc || "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < n; i++) s += abc[Math.floor(Math.random() * abc.length)]; return s; };
  const optLabel = (q, i) => q.options[i].label;
  const optShort = (q, i) => q.options[i].short || q.options[i].label;

  function setConn(state) {
    $conn.hidden = state === "online";
    $conn.textContent = state === "offline" ? "Reconnecting…" : "Connecting…";
  }

  function connect(brokerUrl, onConnect, onMessage) {
    setConn("connecting");
    const client = mqtt.connect(brokerUrl, {
      clientId: "gtb_" + rid(10), keepalive: 30, reconnectPeriod: 2000, connectTimeout: 8000, clean: true,
    });
    client.on("connect", () => { setConn("online"); onConnect(client); });
    client.on("reconnect", () => setConn("offline"));
    client.on("offline", () => setConn("offline"));
    client.on("message", (topic, buf) => { let m; try { m = JSON.parse(buf.toString()); } catch (e) { return; } onMessage(topic, m); });
    return client;
  }

  // Winner of a question: most votes, ties go to the earlier option unless the host picked one.
  function tally(answers, qi, nOpts) {
    const counts = new Array(nOpts).fill(0);
    for (const pid in answers) { const c = answers[pid][qi]; if (c != null && c < nOpts) counts[c]++; }
    let best = 0;
    counts.forEach((n, i) => { if (n > counts[best]) best = i; });
    const tied = counts.map((n, i) => (n === counts[best] && n > 0 ? i : -1)).filter((i) => i >= 0);
    return { counts, best, tied };
  }

  function traitsFrom(choices) {
    // choices: array of option index (or null) per question
    const look = {};
    const list = [];
    QUIZ.questions.forEach((q, i) => {
      const c = choices[i];
      if (c == null || !q.options[c]) return;
      Object.assign(look, q.options[c].baby || {});
      list.push({ trait: q.trait || "Q" + (i + 1), value: optShort(q, c) });
    });
    return { look, list };
  }

  // Which baby features each question controls (eyes, hair, ...).
  const visualKeys = (q) => { const k = new Set(); q.options.forEach((o) => Object.keys(o.baby || {}).forEach((x) => k.add(x))); return k; };
  function hiddenFor(choices) {
    const h = new Set();
    QUIZ.questions.forEach((q, i) => { if (choices[i] == null) visualKeys(q).forEach((k) => h.add(k)); });
    return h;
  }

  function traitChips(list) {
    return '<div class="chips">' + list.map((t) => `<span class="chip"><b>${esc(t.trait)}</b>${esc(t.value)}</span>`).join("") + "</div>";
  }

  // Name ideas, grouped case-insensitively; the same name from several guests gets bigger.
  function cleanName(s) {
    s = String(s || "").replace(/\s+/g, " ").trim().slice(0, 20);
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }
  function nameGroups(names) {
    const g = {};
    Object.keys(names || {}).forEach((pid) => {
      const n = cleanName(names[pid]); if (!n) return;
      const k = n.toLowerCase();
      if (!g[k]) g[k] = { name: n, count: 0 };
      g[k].count++;
    });
    return Object.values(g);
  }
  function nameCloud(groups) {
    if (!groups.length) return '<div class="cloud empty"><p class="muted">Names will pop up here…</p></div>';
    const hash = (s) => { let h = 7; for (const c of s.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
    // Stable order (by name) so the cloud doesn't jump around as new names arrive.
    const items = groups.slice().sort((a, b) => hash(a.name) - hash(b.name)).map((g) => {
      const h = hash(g.name);
      const size = Math.min(1.25 + (g.count - 1) * 0.45, 3.2);
      const tilt = ((h % 7) - 3) * 1.2;
      return `<span class="cname c${h % 6}" style="font-size:${size}rem;transform:rotate(${tilt}deg)">${esc(g.name)}${g.count > 1 ? `<sup>×${g.count}</sup>` : ""}</span>`;
    });
    return `<div class="cloud">${items.join("")}</div>`;
  }

  function confetti() {
    const box = document.createElement("div");
    box.className = "confetti";
    const bits = ["💖", "⭐", "🍼", "✨", "🎀", "💛", "🧸"];
    for (let i = 0; i < 60; i++) {
      const s = document.createElement("span");
      s.textContent = bits[i % bits.length];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDelay = Math.random() * 3 + "s";
      s.style.fontSize = 16 + Math.random() * 22 + "px";
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 9000);
  }

  // =====================================================================
  //  HOST (the big screen)
  // =====================================================================
  function host() {
    document.body.classList.add("host");
    let S = store.get("gtb_host", null);
    if (!S || S.version !== 1) S = newGame();
    if (!S.adminKey) S.adminKey = rid(10);
    if (!S.names) S.names = {};
    store.set("gtb_host", S); // keep the room code and remote key stable across refreshes
    let client = null;
    let brokerIdx = S.broker || 0;
    let publishTimer = null;
    let showGallery = false;
    let animatedQi = -1; // the question whose baby reveal has already played

    function newGame() {
      return { version: 1, room: rid(5, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"), broker: 0, phase: "lobby", qi: 0, players: {}, answers: {}, picks: {}, names: {}, adminKey: rid(10) };
    }
    function save() { store.set("gtb_host", S); }

    function winners() {
      return QUIZ.questions.map((q, i) => {
        if (S.phase === "lobby" || i > S.qi || (i === S.qi && S.phase === "question")) return null;
        if (S.picks[i] != null) return S.picks[i];
        const t = tally(S.answers, i, q.options.length);
        return t.counts[t.best] > 0 ? t.best : null;
      });
    }

    function brokerUrl() { return customBroker || BROKERS[brokerIdx]; }
    function joinUrl(admin) {
      const u = new URL(location.href);
      u.hash = ""; u.search = "";
      u.searchParams.set("room", S.room);
      if (customBroker) u.searchParams.set("bk", customBroker); else u.searchParams.set("b", String(brokerIdx));
      if (admin) u.searchParams.set("admin", S.adminKey);
      return u.toString();
    }

    function publicState() {
      const q = QUIZ.questions[S.qi];
      const st = {
        t: Date.now(), phase: S.phase, qi: S.qi, total: QUIZ.questions.length,
        joined: Object.keys(S.players), gallery: showGallery,
      };
      if (S.phase === "question" || S.phase === "reveal") {
        st.q = { text: q.text, options: q.options.map((o) => o.label) };
        st.answered = Object.keys(S.answers).filter((p) => S.answers[p][S.qi] != null);
      }
      if (S.phase === "reveal") {
        const t = tally(S.answers, S.qi, q.options.length);
        st.counts = t.counts;
        st.winner = winners()[S.qi];
        st.tie = t.tied.length > 1 && S.picks[S.qi] == null;
      }
      if (S.phase === "final" || S.phase === "names") st.winners = winners();
      if (S.phase === "names") st.suggested = Object.keys(S.names);
      return st;
    }

    function publish() {
      clearTimeout(publishTimer);
      publishTimer = setTimeout(() => {
        if (client && client.connected) client.publish(TOPIC(S.room) + "state", JSON.stringify(publicState()), { qos: 1, retain: true });
      }, 150);
    }

    function start() {
      if (client) { try { client.end(true); } catch (e) {} }
      let connected = false;
      client = connect(brokerUrl(), (c) => {
        connected = true;
        c.subscribe([TOPIC(S.room) + "hello", TOPIC(S.room) + "answer", TOPIC(S.room) + "name", TOPIC(S.room) + "cmd"], { qos: 1 });
        publish();
      }, onMessage);
      // If the first broker can't be reached, fall back to the next one (and update the QR code).
      if (!customBroker) {
        setTimeout(() => {
          if (!connected && S.phase === "lobby" && Object.keys(S.players).length === 0) {
            brokerIdx = (brokerIdx + 1) % BROKERS.length; S.broker = brokerIdx; save(); render(); start();
          }
        }, 9000);
      }
    }

    function onMessage(topic, m) {
      const kind = topic.slice(TOPIC(S.room).length);
      if (!m || typeof m.pid !== "string" || m.pid.length > 40) return;
      if (kind === "cmd") {
        if (m.key === S.adminKey) act(m.action, m.arg);
        return;
      }
      if (kind === "hello") {
        const name = String(m.name || "").trim().slice(0, 24);
        if (!name) return;
        const isNew = !S.players[m.pid] || S.players[m.pid].name !== name;
        S.players[m.pid] = { name, at: (S.players[m.pid] && S.players[m.pid].at) || Date.now() };
        if (!S.answers[m.pid]) S.answers[m.pid] = {};
        save(); publish();
        if (isNew) render();
      } else if (kind === "answer") {
        if (!S.players[m.pid]) return;
        const q = QUIZ.questions[m.qi];
        if (S.phase !== "question" || m.qi !== S.qi || !q || !(m.choice >= 0 && m.choice < q.options.length)) { publish(); return; }
        S.answers[m.pid] = S.answers[m.pid] || {};
        S.answers[m.pid][m.qi] = m.choice;
        save(); publish(); render();
      } else if (kind === "name") {
        if (!S.players[m.pid]) return;
        if (S.phase !== "names") { publish(); return; }
        const n = cleanName(m.name);
        if (n) S.names[m.pid] = n; else delete S.names[m.pid];
        save(); publish(); render();
      }
    }

    // Every control (on-screen buttons and the phone remote) goes through here.
    function act(a, arg) {
      const last = S.qi === QUIZ.questions.length - 1;
      if (a === "start" && S.phase === "lobby") go("question", 0);
      else if (a === "reveal" && S.phase === "question") go("reveal");
      else if (a === "next" && S.phase === "reveal") last ? go("final") : go("question", S.qi + 1);
      else if (a === "back") {
        if (S.phase === "question") S.qi === 0 ? go("lobby") : go("reveal", S.qi - 1);
        else if (S.phase === "reveal") go("question");
        else if (S.phase === "final") { showGallery = false; go("reveal", QUIZ.questions.length - 1); }
        else if (S.phase === "names") go("final");
      } else if (a === "pick" && S.phase === "reveal" && arg >= 0 && arg < QUIZ.questions[S.qi].options.length) {
        S.picks[S.qi] = arg; save(); publish(); render();
      } else if (a === "gallery" && S.phase === "final") { showGallery = !showGallery; publish(); render(); }
      else if (a === "names" && S.phase === "final") { showGallery = false; go("names"); }
    }
    function bindActs() {
      $app.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(b.dataset.act, b.dataset.arg != null ? +b.dataset.arg : undefined)));
    }

    function go(phase, qi) {
      const fromNames = S.phase === "names";
      if (phase === "reveal" && qi != null) animatedQi = qi; // going back: no replay
      S.phase = phase;
      if (qi != null) S.qi = qi;
      save(); publish(); render();
      if (phase === "final" && !fromNames) confetti();
    }

    // ----- views -----
    function render() {
      const n = Object.keys(S.players).length;
      if (S.phase === "lobby") return renderLobby(n);
      if (S.phase === "final") return renderFinal();
      if (S.phase === "names") return renderNames();
      return renderQuestion(n);
    }

    function qrSvg(text) {
      const qr = qrcode(0, "M"); qr.addData(text); qr.make();
      return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    }

    function renderLobby(n) {
      const names = Object.values(S.players).sort((a, b) => a.at - b.at).map((p) => `<span class="name-chip">${esc(p.name)}</span>`).join("");
      $app.innerHTML = `
      <div class="host-wrap lobby">
        <div class="lobby-left">
          <p class="kicker">${esc(QUIZ.mom)} &amp; ${esc(QUIZ.dad)}'s baby shower</p>
          <h1 class="big-title">${esc(QUIZ.title)}</h1>
          <p class="lead">Scan the code with your phone camera to join</p>
          <div class="qr">${qrSvg(joinUrl())}</div>
          <p class="small muted url">${esc(joinUrl())}</p>
        </div>
        <div class="lobby-right">
          <div class="baby-hero">${babySVG({}, { bg: "#ffe9de", hidden: hiddenFor([]) })}</div>
          <h2>${n} ${n === 1 ? "guest has" : "guests have"} joined</h2>
          <div class="names">${names || '<span class="muted">Waiting for the first guest…</span>'}</div>
          <div class="controls">
            <button class="btn primary big" data-act="start" ${n ? "" : "disabled"}>Start the quiz ▶</button>
          </div>
        </div>
      </div>
      ${footer()}`;
      bindActs();
      bindFooter();
    }

    function renderQuestion(n) {
      const q = QUIZ.questions[S.qi];
      const reveal = S.phase === "reveal";
      const t = tally(S.answers, S.qi, q.options.length);
      const answered = Object.keys(S.players).filter((p) => S.answers[p] && S.answers[p][S.qi] != null);
      const waiting = Object.keys(S.players).filter((p) => !answered.includes(p)).map((p) => S.players[p].name);
      const total = t.counts.reduce((a, b) => a + b, 0) || 1;
      const win = winners()[S.qi];
      const isTie = reveal && t.tied.length > 1 && S.picks[S.qi] == null;
      const last = S.qi === QUIZ.questions.length - 1;
      const w = winners();
      const sofar = traitsFrom(w);
      // The reveal drama plays once per question: shadowy shaking baby, then the new feature pops in.
      const drama = reveal && animatedQi !== S.qi && win != null;
      const before = w.slice(); if (drama) before[S.qi] = null;
      const shown = traitsFrom(before);

      const opts = q.options.map((o, i) => {
        const pct = Math.round((t.counts[i] / total) * 100);
        const cls = ["opt", "c" + (i % 6)];
        if (reveal && i === win) cls.push("winner");
        if (reveal && i !== win) cls.push("dim");
        return `<button class="${cls.join(" ")}" ${reveal ? `data-act="pick" data-arg="${i}"` : "tabindex=-1"}>
          <span class="letter">${LETTERS[i]}</span><span class="otext">${esc(o.label)}</span>
          ${reveal ? `<span class="bar" style="width:${pct}%"></span><span class="count">${t.counts[i]} ${t.counts[i] === 1 ? "vote" : "votes"}</span>` : ""}
          ${reveal && i === win ? '<span class="crown">👑</span>' : ""}
        </button>`;
      }).join("");

      $app.innerHTML = `
      <div class="host-wrap qscreen">
        <div class="qmain">
          <p class="kicker">Question ${S.qi + 1} of ${QUIZ.questions.length}</p>
          <h1 class="qtext">${esc(q.text)}</h1>
          <div class="opts host-opts">${opts}</div>
          ${isTie ? `<p class="tie">It's a tie! Click the answer you'd like to win.</p>` : ""}
          ${reveal && win == null ? `<p class="tie">Nobody voted on this one.</p>` : ""}
        </div>
        <aside class="qside">
          <div class="mini-baby ${reveal ? "big" : ""}"><div id="sideBaby" class="${drama ? "shake" : ""}">${babySVG(shown.look, { bg: "#ffe9de", hidden: hiddenFor(before) })}</div>
            <p class="small muted">${drama ? "Drumroll…" : "Our baby so far"}</p>
            <div class="chips mini" id="sideChips">${shown.list.map((t) => `<span class="chip"><b>${esc(t.trait)}</b>${esc(t.value)}</span>`).join("")}</div></div>
          ${reveal ? "" : `
          <div class="progress"><div class="pbar"><span style="width:${n ? (answered.length / n) * 100 : 0}%"></span></div>
            <p class="pcount"><b>${answered.length}</b> of ${n} answered</p>
            ${waiting.length && waiting.length <= 12 ? `<p class="small muted">Waiting for: ${waiting.map(esc).join(", ")}</p>` : ""}
          </div>`}
          <div class="controls col">
            ${reveal
              ? `<button class="btn primary big" data-act="next">${last ? "Meet our baby! 👶" : "Next question ▶"}</button>
                 <button class="btn ghost" data-act="back">◀ Reopen voting</button>`
              : `<button class="btn primary big" data-act="reveal">Reveal answers ✨</button>
                 <button class="btn ghost" data-act="back">◀ Previous</button>`}
          </div>
        </aside>
      </div>
      ${footer()}`;

      bindActs();
      bindFooter();
      if (drama) {
        animatedQi = S.qi;
        const qi = S.qi;
        setTimeout(() => {
          const box = document.getElementById("sideBaby");
          if (!box || S.phase !== "reveal" || S.qi !== qi) return;
          box.className = "pop";
          box.innerHTML = babySVG(sofar.look, { bg: "#ffe9de", hidden: hiddenFor(w) });
          sparkle(box);
          box.nextElementSibling.textContent = "Our baby so far";
          const chips = document.getElementById("sideChips");
          const added = sofar.list[sofar.list.length - 1];
          if (chips && added) chips.insertAdjacentHTML("beforeend", `<span class="chip new"><b>${esc(added.trait)}</b>${esc(added.value)}</span>`);
        }, 2200);
      }
    }

    function renderFinal() {
      const w = winners();
      const crowd = traitsFrom(w);
      let body;
      if (showGallery) {
        const cards = Object.keys(S.players).map((pid) => {
          const mine = QUIZ.questions.map((q, i) => (S.answers[pid] || {})[i] ?? null);
          const score = mine.filter((c, i) => c != null && c === w[i]).length;
          return { name: S.players[pid].name, look: traitsFrom(mine).look, score };
        }).sort((a, b) => b.score - a.score);
        body = `
          <h1 class="big-title sm">Everyone's babies</h1>
          <p class="lead">Ranked by how often each guest agreed with the crowd</p>
          <div class="gallery">${cards.map((c) => `<div class="gcard">${babySVG(c.look)}<p class="gname">${c.score > 0 && c.score === cards[0].score ? "🏆 " : ""}${esc(c.name)}</p><p class="small muted">${c.score} of ${QUIZ.questions.length} with the crowd</p></div>`).join("")}</div>`;
      } else {
        body = `
          <div class="final">
            <div class="final-baby">${babySVG(crowd.look, { bg: "#ffe9de" })}</div>
            <div class="final-text">
              <p class="kicker">The crowd has spoken!</p>
              <h1 class="big-title">Meet ${esc(QUIZ.mom)} &amp; ${esc(QUIZ.dad)}'s baby</h1>
              ${traitChips(crowd.list.concat(QUIZ.extras || []))}
            </div>
          </div>`;
      }
      $app.innerHTML = `
      <div class="host-wrap">${body}
        <div class="controls center">
          ${showGallery ? "" : '<button class="btn primary" data-act="names">Name the baby ✏️</button>'}
          <button class="btn ${showGallery ? "primary" : "secondary"}" data-act="gallery">${showGallery ? "Back to our baby 👶" : "See everyone's babies 👶👶👶"}</button>
          <button class="btn ghost" data-act="back">◀ Back to last question</button>
        </div>
      </div>
      ${footer()}`;
      bindActs();
      bindFooter();
    }

    function renderNames() {
      const crowd = traitsFrom(winners());
      const groups = nameGroups(S.names);
      const n = Object.keys(S.names).length;
      $app.innerHTML = `
      <div class="host-wrap">
        <div class="final names-screen">
          <div class="final-baby">${babySVG(crowd.look, { bg: "#ffe9de" })}</div>
          <div class="final-text">
            <p class="kicker">One last thing…</p>
            <h1 class="big-title sm">What should we call this baby?</h1>
            <p class="lead">Type a name on your phone. ${n ? `<b>${n}</b> ${n === 1 ? "idea" : "ideas"} so far` : ""}</p>
            ${nameCloud(groups)}
          </div>
        </div>
        <div class="controls center">
          <button class="btn ghost" data-act="back">◀ Back to our baby</button>
        </div>
      </div>
      ${footer()}`;
      bindActs();
      bindFooter();
    }

    function footer() {
      return `<footer class="host-foot"><span>Room <b>${esc(S.room)}</b> · ${Object.keys(S.players).length} players</span>
        ${S.phase !== "lobby" ? '<button class="link" id="qrBtn">Show join code</button>' : ""}
        <button class="link" id="remoteBtn">Phone remote</button>
        <button class="link" id="resetBtn">New game</button></footer>`;
    }
    function bindFooter() {
      document.getElementById("resetBtn").onclick = () => {
        if (!confirm("Start a brand new game? Everyone will need to scan the new code to join again.")) return;
        if (client && client.connected) client.publish(TOPIC(S.room) + "state", JSON.stringify({ phase: "closed" }), { qos: 1, retain: true });
        S = newGame(); S.broker = brokerIdx; save(); render(); start();
      };
      const overlay = (title, url, note) => {
        const d = document.createElement("div");
        d.className = "overlay";
        d.innerHTML = `<div class="overlay-card"><h2>${title}</h2><div class="qr">${qrSvg(url)}</div><p class="small muted">${note}</p></div>`;
        d.onclick = () => d.remove();
        document.body.appendChild(d);
      };
      const qb = document.getElementById("qrBtn");
      if (qb) qb.onclick = () => overlay("Scan to join", joinUrl(), "Tap anywhere to close");
      document.getElementById("remoteBtn").onclick = () => overlay("Your phone remote", joinUrl(true),
        "Scan this with <b>your</b> phone only: it controls the game. Tap anywhere to close.");
    }

    render();
    start();
  }

  function sparkle(el) {
    const bits = ["✨", "⭐", "💖", "✨", "🌟", "✨", "💛", "⭐"];
    bits.forEach((b, i) => {
      const s = document.createElement("span");
      s.className = "spark"; s.textContent = b;
      const a = (i / bits.length) * Math.PI * 2;
      s.style.setProperty("--dx", Math.cos(a) * 130 + "px");
      s.style.setProperty("--dy", Math.sin(a) * 130 + "px");
      el.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    });
  }

  // =====================================================================
  //  PHONE REMOTE (for the host, so you can run the game from your phone)
  // =====================================================================
  function remote(room, key) {
    document.body.classList.add("player");
    const brokerUrl = customBroker || BROKERS[+params.get("b") || 0] || BROKERS[0];
    const pid = "remote_" + rid(8);
    let st = null, client = null, lastTap = 0;

    function cmd(action, arg) {
      if (Date.now() - lastTap < 900) return; // ignore double taps
      lastTap = Date.now();
      if (client && client.connected) client.publish(TOPIC(room) + "cmd", JSON.stringify({ pid, key, action, arg }), { qos: 1 });
      if (navigator.vibrate) navigator.vibrate(20);
    }

    function render() {
      const head = `<header class="phead"><span>${esc(QUIZ.title)}</span><span class="me">Host remote</span></header>`;
      if (!st) { $app.innerHTML = `<div class="phone">${head}<div class="pwait"><div class="spinner"></div><p>Connecting to the game…</p><p class="small muted">Make sure the host screen is open on the laptop.</p></div></div>`; return; }
      const n = (st.joined || []).length;
      const btn = (a, label, cls, arg) => `<button class="btn ${cls || "primary big"} wide" data-a="${a}" ${arg != null ? `data-arg="${arg}"` : ""}>${label}</button>`;
      let body = "";
      if (st.phase === "closed") body = `<div class="pwait"><h2>This game has ended</h2><p>Scan the new remote code from the laptop.</p></div>`;
      else if (st.phase === "lobby") body = `<p class="kicker">Lobby</p><h2>${n} ${n === 1 ? "guest has" : "guests have"} joined</h2>${btn("start", "Start the quiz ▶")}`;
      else if (st.phase === "question") {
        const a = (st.answered || []).length;
        body = `<p class="kicker">Question ${st.qi + 1} of ${st.total}</p><h2 class="pq">${esc(st.q.text)}</h2>
          <div class="pbar"><span style="width:${n ? (a / n) * 100 : 0}%"></span></div><p class="pcount"><b>${a}</b> of ${n} answered</p>
          ${btn("reveal", "Reveal answers ✨")}${btn("back", "◀ Previous", "ghost")}`;
      } else if (st.phase === "reveal") {
        const last = st.qi === st.total - 1;
        body = `<p class="kicker">Question ${st.qi + 1} of ${st.total}: results</p><h2 class="pq">${esc(st.q.text)}</h2>
          <div class="opts">${st.q.options.map((label, i) => `<button class="opt c${i % 6} ${i === st.winner ? "winner" : ""}" data-a="pick" data-arg="${i}"><span class="letter">${LETTERS[i]}</span><span class="otext">${esc(label)}</span><span class="count">${(st.counts || [])[i] || 0}</span>${i === st.winner ? '<span class="crown">👑</span>' : ""}</button>`).join("")}</div>
          <p class="pnote">${st.tie ? "It's a tie! Tap the answer you want to win." : "Tap an answer to make it the winner instead."}</p>
          ${btn("next", last ? "Meet our baby! 👶" : "Next question ▶")}${btn("back", "◀ Reopen voting", "ghost")}`;
      } else if (st.phase === "final") {
        body = `<p class="kicker">The end</p><h2>Baby revealed! 🎉</h2>
          ${st.gallery ? "" : btn("names", "Name the baby ✏️")}
          ${btn("gallery", st.gallery ? "Back to our baby 👶" : "See everyone's babies 👶👶👶", st.gallery ? "primary big" : "secondary")}${btn("back", "◀ Back to last question", "ghost")}`;
      } else if (st.phase === "names") {
        const k = (st.suggested || []).length;
        body = `<p class="kicker">Baby names</p><h2>${k} of ${n} guests have suggested a name</h2>
          <p class="pnote">The names show up on the big screen as they come in.</p>
          ${btn("back", "◀ Back to our baby", "ghost")}`;
      }
      $app.innerHTML = `<div class="phone remote">${head}${body}</div>`;
      $app.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => cmd(b.dataset.a, b.dataset.arg != null ? +b.dataset.arg : undefined)));
    }

    render();
    client = connect(brokerUrl, (c) => c.subscribe(TOPIC(room) + "state", { qos: 1 }), (topic, m) => { st = m; render(); });
  }

  // =====================================================================
  //  PLAYER (phones)
  // =====================================================================
  function player(room) {
    document.body.classList.add("player");
    const brokerUrl = customBroker || BROKERS[+params.get("b") || 0] || BROKERS[0];
    const key = "gtb_p_" + room;
    const me = store.get(key, null) || { pid: rid(12), name: "", answers: {} };
    store.set(key, me);
    let st = null;
    let client = null;
    let lastHello = 0, lastResend = 0;
    let lastView = "";

    function save() { store.set(key, me); }
    function send(kind, m) { if (client && client.connected) client.publish(TOPIC(room) + kind, JSON.stringify(Object.assign({ pid: me.pid }, m)), { qos: 1 }); }
    function hello() { lastHello = Date.now(); send("hello", { name: me.name }); }

    function onState(s) {
      st = s;
      if (me.name && st.joined && !st.joined.includes(me.pid) && Date.now() - lastHello > 2500) hello();
      // make sure the host has my answer for the current question
      if (st.phase === "names" && me.idea && st.suggested && !st.suggested.includes(me.pid) && Date.now() - lastResend > 2500) {
        lastResend = Date.now();
        send("name", { name: me.idea });
      }
      if (st.phase === "question" && me.answers[st.qi] != null && st.answered && !st.answered.includes(me.pid) && Date.now() - lastResend > 2500) {
        lastResend = Date.now();
        send("answer", { qi: st.qi, choice: me.answers[st.qi] });
      }
      render();
    }

    function start() {
      client = connect(brokerUrl, (c) => {
        c.subscribe(TOPIC(room) + "state", { qos: 1 });
        if (me.name) hello();
      }, (topic, m) => { if (topic.endsWith("/state")) onState(m); });
    }

    function shell(inner, cls) {
      return `<div class="phone ${cls || ""}"><header class="phead"><span>${esc(QUIZ.title)}</span>${me.name ? `<span class="me">${esc(me.name)}</span>` : ""}</header>${inner}</div>`;
    }

    function render() {
      // Keep typing / focus intact on the join screen.
      if (!me.name) {
        if (lastView === "join") return;
        lastView = "join";
        $app.innerHTML = shell(`
          <div class="pjoin">
            <div class="baby-hero sm">${babySVG({ mouth: "grin" })}</div>
            <h1>Welcome to ${esc(QUIZ.mom)} &amp; ${esc(QUIZ.dad)}'s baby shower!</h1>
            <p>What's your name?</p>
            <form id="joinForm"><input id="nameIn" maxlength="24" autocomplete="given-name" placeholder="Your name" required>
            <button class="btn primary big" type="submit">Join the game</button></form>
          </div>`);
        document.getElementById("joinForm").onsubmit = (e) => {
          e.preventDefault();
          const v = document.getElementById("nameIn").value.trim();
          if (!v) return;
          me.name = v; save(); hello(); lastView = ""; render();
        };
        return;
      }
      if (st && st.phase === "names") return renderNames();
      lastView = "";
      if (!st) { $app.innerHTML = shell(`<div class="pwait"><div class="spinner"></div><p>Connecting to the game…</p></div>`); return; }
      if (st.phase === "closed") { $app.innerHTML = shell(`<div class="pwait"><h2>This game has ended</h2><p>Scan the new code on the screen to join the next one.</p></div>`); return; }
      if (st.phase === "lobby") {
        const ok = st.joined && st.joined.includes(me.pid);
        $app.innerHTML = shell(`<div class="pwait">
          <div class="baby-hero sm">${babySVG({})}</div>
          <h2>${ok ? `You're in, ${esc(me.name)}! 🎉` : "Joining…"}</h2>
          <p>Hang tight. The quiz starts soon. Keep this page open.</p>
          <button class="link" id="rename">Not ${esc(me.name)}? Change name</button></div>`);
        document.getElementById("rename").onclick = () => { me.name = ""; save(); render(); };
        return;
      }
      if (st.phase === "question" || st.phase === "reveal") return renderQ();
      if (st.phase === "final") return renderFinal();
    }

    function renderQ() {
      const reveal = st.phase === "reveal";
      const mine = me.answers[st.qi];
      const received = st.answered && st.answered.includes(me.pid);
      const opts = st.q.options.map((label, i) => {
        const cls = ["opt", "c" + (i % 6)];
        if (mine === i) cls.push("picked");
        if (reveal && i === st.winner) cls.push("winner");
        if (reveal && i !== st.winner) cls.push("dim");
        return `<button class="${cls.join(" ")}" data-i="${i}" ${reveal ? "disabled" : ""}><span class="letter">${LETTERS[i]}</span><span class="otext">${esc(label)}</span>${mine === i ? '<span class="tick">✓</span>' : ""}${reveal && i === st.winner ? '<span class="crown">👑</span>' : ""}</button>`;
      }).join("");
      let note;
      if (reveal) {
        note = st.winner == null ? "No votes on this one."
          : mine === st.winner ? "🎉 You agreed with the crowd!"
          : mine == null ? "You didn't vote on this one." : "You went your own way on this one 💫";
      } else if (mine == null) note = "Tap your answer";
      else note = received ? "Answer saved ✓ You can change it until the reveal." : "Sending…";
      $app.innerHTML = shell(`
        <p class="kicker">Question ${st.qi + 1} of ${st.total}</p>
        <h2 class="pq">${esc(st.q.text)}</h2>
        <div class="opts">${opts}</div>
        <p class="pnote ${reveal ? "big" : ""}">${note}</p>`);
      if (!reveal) $app.querySelectorAll(".opt").forEach((b) => (b.onclick = () => {
        me.answers[st.qi] = +b.dataset.i; save();
        send("answer", { qi: st.qi, choice: me.answers[st.qi] });
        if (st.answered) st.answered = st.answered.filter((p) => p !== me.pid);
        if (navigator.vibrate) navigator.vibrate(15);
        render();
      }));
    }

    function renderNames() {
      const got = me.idea && st.suggested && st.suggested.includes(me.pid);
      const status = !me.idea ? "Any name you like. It shows up on the big screen."
        : got ? `Sent ✓ <b>${esc(me.idea)}</b> is on the big screen. You can change it.` : "Sending…";
      // Don't rebuild while someone is typing; just refresh the status line.
      if (lastView === "names" && document.getElementById("ideaForm")) {
        document.getElementById("ideaStatus").innerHTML = status;
        return;
      }
      lastView = "names";
      const crowd = traitsFrom(st.winners || []);
      $app.innerHTML = shell(`
        <p class="kicker">One last thing</p>
        <h2>What should we call this baby?</h2>
        <div class="baby-hero sm">${babySVG(crowd.look, { bg: "#ffe9de" })}</div>
        <div class="pjoin"><form id="ideaForm"><input id="ideaIn" maxlength="20" autocomplete="off" placeholder="Your name idea" value="${esc(me.idea || "")}" required>
        <button class="btn primary big" type="submit">Send ✨</button></form></div>
        <p class="pnote" id="ideaStatus">${status}</p>`, "final-phone");
      document.getElementById("ideaForm").onsubmit = (e) => {
        e.preventDefault();
        const v = cleanName(document.getElementById("ideaIn").value);
        if (!v) return;
        me.idea = v; save();
        if (st.suggested) st.suggested = st.suggested.filter((p) => p !== me.pid);
        send("name", { name: v });
        document.getElementById("ideaIn").blur();
        if (navigator.vibrate) navigator.vibrate(15);
        renderNames();
      };
    }

    let celebrated = false;
    function renderFinal() {
      const mine = QUIZ.questions.map((q, i) => (me.answers[i] != null ? me.answers[i] : null));
      const my = traitsFrom(mine);
      const crowd = traitsFrom(st.winners || []);
      const score = mine.filter((c, i) => c != null && st.winners && c === st.winners[i]).length;
      $app.innerHTML = shell(`
        <p class="kicker">Here's the baby you imagined</p>
        <h2>${esc(me.name)}'s baby</h2>
        <div class="baby-hero">${babySVG(my.look)}</div>
        ${traitChips(my.list.concat(QUIZ.extras || []))}
        <p class="pnote">You agreed with the crowd on <b>${score} of ${st.total}</b> questions.</p>
        <h3>The crowd's baby</h3>
        <div class="baby-hero sm">${babySVG(crowd.look, { bg: "#ffe9de" })}</div>
        <p class="small muted center">Look up at the big screen! 👀</p>`, "final-phone");
      if (!celebrated) { celebrated = true; confetti(); }
    }

    render();
    start();
  }

  // =====================================================================
  //  Landing (no room code and not the host)
  // =====================================================================
  function landing() {
    $app.innerHTML = `<div class="phone"><div class="pjoin">
      <div class="baby-hero sm">${babySVG({ mouth: "grin" })}</div>
      <h1>${esc(QUIZ.title)}</h1>
      <p>Guests: scan the QR code on the big screen to join.</p>
      <form id="codeForm"><input id="codeIn" maxlength="6" placeholder="or type the room code" autocapitalize="characters">
      <button class="btn primary" type="submit">Join</button></form>
      <p class="small muted" style="margin-top:2.5rem">Running the game? <a href="#host" id="hostLink">Open the host screen</a></p>
    </div></div>`;
    document.getElementById("codeForm").onsubmit = (e) => {
      e.preventDefault();
      const v = document.getElementById("codeIn").value.trim().toUpperCase();
      if (v) location.search = "?room=" + encodeURIComponent(v);
    };
    document.getElementById("hostLink").onclick = () => setTimeout(() => location.reload(), 0);
  }

  const room = (params.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (room && params.get("admin")) remote(room, params.get("admin"));
  else if (room) player(room);
  else if (location.hash === "#host") host();
  else landing();
})();
