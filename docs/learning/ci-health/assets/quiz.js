// Reusable quiz component.
// Usage: <div class="quiz" id="quiz"></div>
//        <script src="../assets/quiz.js"></script>
//        <script>renderQuiz("quiz", [{ q, options: [..], answer: index, why }])</script>
// Options are shuffled on each load. Feedback is immediate.
function renderQuiz(id, questions) {
  const root = document.getElementById(id);
  let answered = 0;
  let correct = 0;
  const score = document.createElement("p");
  score.className = "score";

  questions.forEach((item, n) => {
    const wrap = document.createElement("div");
    wrap.className = "q";
    const prompt = document.createElement("p");
    prompt.innerHTML = "<strong>" + (n + 1) + ".</strong> " + item.q;
    wrap.appendChild(prompt);
    const why = document.createElement("div");
    why.className = "why";

    const order = item.options.map((text, i) => ({ text, i }));
    for (let k = order.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    const buttons = order.map(({ text, i }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => {
        buttons.forEach((x) => (x.disabled = true));
        const right = i === item.answer;
        b.classList.add(right ? "right" : "wrong");
        if (!right) {
          buttons[order.findIndex((o) => o.i === item.answer)].classList.add("right");
        }
        why.textContent = (right ? "Correct. " : "Not quite. ") + item.why;
        answered += 1;
        if (right) correct += 1;
        if (answered === questions.length) {
          score.textContent = "You got " + correct + " of " + questions.length + ". Reload the page to try again in a new order.";
        }
      });
      wrap.appendChild(b);
      return b;
    });
    wrap.appendChild(why);
    root.appendChild(wrap);
  });
  root.appendChild(score);
}
