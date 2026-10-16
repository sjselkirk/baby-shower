// The baby picture: one whole picture per hair look (light brown, blonde or ginger; straight
// or curly), with recoloured layers stacked on top for each vote: eyes, hoodie, freckles, dimples.
(function () {
  // Where each layer sits on its 740x740 picture: [x0, y0, x1, y1]
  const BOX = {"straight-lightbrown": {"eyes": [290, 273, 470, 345], "top": [170, 398, 570, 640], "freckles": [257, 317, 501, 374], "dimples": [328, 366, 447, 385]}, "straight-blonde": {"eyes": [288, 273, 470, 344], "top": [170, 398, 570, 640], "freckles": [257, 317, 501, 375], "dimples": [328, 366, 447, 385]}, "straight-ginger": {"eyes": [289, 274, 468, 344], "top": [170, 398, 570, 640], "freckles": [257, 317, 500, 375], "dimples": [328, 366, 447, 385]}, "curly-lightbrown": {"eyes": [289, 274, 469, 345], "top": [170, 398, 570, 640], "freckles": [257, 318, 501, 376], "dimples": [328, 366, 447, 385]}, "curly-blonde": {"eyes": [287, 273, 469, 344], "top": [170, 398, 570, 640], "freckles": [257, 316, 500, 373], "dimples": [328, 366, 447, 385]}, "curly-ginger": {"eyes": [288, 273, 469, 345], "top": [170, 398, 570, 640], "freckles": [257, 317, 500, 375], "dimples": [328, 366, 447, 385]}, "hair-straight": [169, 24, 544, 349], "hair-curly": [145, 25, 580, 431]};
  const OK = {
    eyes: ["greyblue", "bluegreen"], hair: ["lightbrown", "blonde", "ginger"],
    hairType: ["straight", "curly"], onesie: ["green", "blue"],
  };
  const one = (k, v) => (OK[k].includes(v) ? v : OK[k][0]);

  // Fetch every layer up front so reveals swap instantly.
  OK.hairType.forEach((type) => {
    new Image().src = `img/hair-hidden-${type}.png`;
    OK.hair.forEach((col) => {
      const key = `${type}-${col}`;
      const files = [`base-${key}.jpg`, `freckles-${key}.png`, `dimples-${key}.png`];
      ["greyblue", "bluegreen", "hidden"].forEach((e) => files.push(`eyes-${e}-${key}.png`));
      ["green", "blue", "hidden"].forEach((c) => files.push(`top-${c}-${key}.png`));
      files.forEach((f) => { new Image().src = "img/" + f; });
    });
  });

  window.babySVG = function (traits, opts) {
    const t = Object.assign({}, (window.QUIZ && window.QUIZ.defaultBaby) || {}, traits || {});
    // Features not revealed yet are shown greyed out.
    const hidden = (opts && opts.hidden) || new Set();
    const H = (k) => hidden.has(k);
    const id = "b" + Math.random().toString(36).slice(2, 8);
    const type = H("hairType") ? "straight" : one("hairType", t.hairType);
    const col = H("hair") ? "lightbrown" : one("hair", t.hair);
    const key = `${type}-${col}`;
    const box = BOX[key];
    const at = (b, name) => `<image href="img/${name}" x="${b[0]}" y="${b[1]}" width="${b[2] - b[0]}" height="${b[3] - b[1]}"/>`;
    const img = (kind, name) => at(box[kind], `${name}-${key}.png`);

    let s = `<svg viewBox="90 20 560 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Baby picture">`;
    s += `<defs><clipPath id="${id}c"><rect x="90" y="20" width="560" height="700" rx="44"/></clipPath></defs><g clip-path="url(#${id}c)">`;
    s += `<image href="img/base-${key}.jpg" x="0" y="0" width="740" height="740"/>`;
    s += img("top", "top-" + (H("onesie") ? "hidden" : one("onesie", t.onesie)));
    if (H("hair")) s += at(BOX["hair-" + type], `hair-hidden-${type}.png`);
    s += img("eyes", "eyes-" + (H("eyes") ? "hidden" : one("eyes", t.eyes)));
    if (t.freckles && !H("freckles")) s += img("freckles", "freckles");
    if (t.dimples && !H("dimples")) s += img("dimples", "dimples");
    if (hidden.size) s += `<text x="430" y="585" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="72" fill="#fff" opacity=".9">?</text>`;
    s += `</g></svg>`;
    return s;
  };
})();
