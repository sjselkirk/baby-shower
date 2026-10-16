// ============================================================
//  EDIT THIS FILE to change the quiz.
//  On GitHub: open this file, click the pencil icon, edit, "Commit changes".
// ============================================================

window.QUIZ = {
  title: "Guess the Baby!",
  mom: "Nina",
  dad: "Paddy",

  // Each question has a "text" and a list of "options".
  // An option can change how the baby looks by setting "baby: { ... }".
  // Things the baby picture understands:
  //   eyes:     "greyblue" | "bluegreen"
  //   hair:     "lightbrown" | "blonde" | "ginger"
  //   hairType: "straight" | "curly"
  //   freckles: true | false
  //   dimples:  true | false
  //   onesie:   "green" | "blue"   (the hoodie colour)
  // Options without "baby" still count; their winner is listed under the picture.
  // "short" is the word shown next to the baby (optional).
  questions: [
    {
      text: "Nina's eyes are grey-blue and Paddy's are blue-green. What colour will baby's eyes be?",
      trait: "Eyes",
      options: [
        { label: "Grey-blue like Nina", short: "Grey-blue", baby: { eyes: "greyblue" } },
        { label: "Blue-green like Paddy", short: "Blue-green", baby: { eyes: "bluegreen" } },
      ],
    },
    {
      text: "Nina's hair is light brown and Paddy's is blonde. What colour will baby's hair be?",
      trait: "Hair colour",
      options: [
        { label: "Light brown like Nina", short: "Light brown", baby: { hair: "lightbrown" } },
        { label: "Blonde like Paddy", short: "Blonde", baby: { hair: "blonde" } },
        { label: "Ginger like Paddy's family", short: "Ginger", baby: { hair: "ginger" } },
      ],
    },
    {
      text: "Nina's hair is straight and Paddy's is wavy. What will baby's hair be like?",
      trait: "Hair type",
      options: [
        { label: "Straight like Nina", short: "Straight", baby: { hairType: "straight" } },
        { label: "Wavy or curly like Paddy", short: "Curly", baby: { hairType: "curly" } },
      ],
    },
    {
      text: "Paddy has freckles and Nina doesn't. Will baby have freckles?",
      trait: "Freckles",
      options: [
        { label: "Yes, like Paddy", short: "Freckles", baby: { freckles: true } },
        { label: "No, like Nina", short: "No freckles", baby: { freckles: false } },
      ],
    },
    {
      text: "Nina has dimples and Paddy doesn't. Will baby have dimples?",
      trait: "Dimples",
      options: [
        { label: "Yes, like Nina", short: "Dimples", baby: { dimples: true } },
        { label: "No, like Paddy", short: "No dimples", baby: { dimples: false } },
      ],
    },
    {
      text: "What will baby's favourite colour be?",
      trait: "Favourite colour",
      options: [
        { label: "Green", baby: { onesie: "green" } },
        { label: "Blue", baby: { onesie: "blue" } },
      ],
    },
  ],

  // How the baby looks before anyone votes on a trait.
  defaultBaby: {
    eyes: "greyblue", hair: "lightbrown", hairType: "straight", freckles: false,
    dimples: false, onesie: "peach",
  },
};
