(() => {
  const token = document.querySelector('meta[name="app-token"]').content;
  const $ = (id) => document.getElementById(id);
  const thread = $("thread"), form = $("form"), q = $("q"), send = $("send");
  let busy = false;
  let startNew = false;

  function scrollDown() { thread.scrollTop = thread.scrollHeight; }

  function addBubble(kind, text) {
    const w = $("welcome");
    if (w) w.remove();
    const el = document.createElement("div");
    el.className = "bubble " + kind;
    if (kind === "bot") {
      // keep "Step N:" lines visually separated; textContent only (no HTML injection)
      text.split("\n").forEach((line) => {
        if (!line.trim()) return;
        const p = document.createElement("span");
        p.className = "step";
        const m = line.match(/^(Step \d+:)\s*(.*)$/);
        if (m) {
          const b = document.createElement("strong");
          b.textContent = m[1] + " ";
          p.appendChild(b);
          p.appendChild(document.createTextNode(m[2]));
        } else {
          p.textContent = line;
        }
        el.appendChild(p);
      });
    } else {
      el.textContent = text;
    }
    thread.appendChild(el);
    scrollDown();
    return el;
  }

  function typing() {
    const el = document.createElement("div");
    el.className = "bubble bot";
    el.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    thread.appendChild(el);
    scrollDown();
    return el;
  }

  async function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    send.disabled = true;
    addBubble("user", text);
    const wait = typing();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Token": token },
        body: JSON.stringify({ question: text, new_chat: startNew }),
      });
      startNew = false;
      let data = {};
      try { data = await res.json(); } catch (e) {}
      wait.remove();
      if (!res.ok) addBubble("error", data.error || "Something went wrong. Please try again.");
      else addBubble("bot", data.answer || "No answer returned.");
    } catch (e) {
      wait.remove();
      addBubble("error", "Cannot reach the assistant. Check that the app is running.");
    } finally {
      busy = false;
      send.disabled = false;
      q.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = q.value;
    q.value = "";
    q.style.height = "auto";
    ask(text);
  });

  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  q.addEventListener("input", () => {
    q.style.height = "auto";
    q.style.height = Math.min(q.scrollHeight, 160) + "px";
  });

  document.querySelectorAll("[data-q]").forEach((b) =>
    b.addEventListener("click", () => ask(b.dataset.q))
  );

  $("new-chat").addEventListener("click", async () => {
    try {
      await fetch("/api/chat/reset", { method: "POST", headers: { "X-App-Token": token } });
    } catch (e) {}
    location.reload();
  });

  // knowledge-base status (document count only; no names)
  fetch("/api/status").then((r) => r.json()).then((d) => {
    if (!d.documents) {
      $("dot").classList.add("off");
      $("status").textContent = "No documents yet. Ask your admin";
    } else {
      $("status").textContent = d.documents + " document" + (d.documents === 1 ? "" : "s") + " available";
    }
  }).catch(() => {});

  q.focus();
})();
