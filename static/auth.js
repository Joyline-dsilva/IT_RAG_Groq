(() => {
  const token = document.querySelector('meta[name="app-token"]').content;
  const $ = (id) => document.getElementById(id);
  const views = ["setup", "code", "login", "forgot"];
  const msg = $("msg");

  function show(name) {
    views.forEach((v) => { $("v-" + v).hidden = v !== name; });
    say("");
    const first = document.querySelector("#v-" + name + " input");
    if (first) first.focus();
  }

  function say(text, ok) {
    msg.textContent = text;
    msg.className = "msg" + (text ? " show " + (ok ? "ok" : "err") : "");
  }

  async function api(path, method, data) {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "X-App-Token": token },
      body: data ? JSON.stringify(data) : undefined,
    });
    let json = {};
    try { json = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error(json.error || "Something went wrong.");
    return json;
  }

  // show / hide password
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.toggle);
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      btn.textContent = hidden ? "Hide" : "Show";
    });
  });

  // password strength meter
  $("s-pass").addEventListener("input", (e) => {
    const p = e.target.value;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++;
    if (p.length >= 12) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    const bar = $("s-meter");
    bar.style.width = (s * 25) + "%";
    bar.style.background = ["#ff6b81", "#ff6b81", "#f5b84c", "#4ade80", "#4ade80"][s];
  });

  // setup
  $("f-setup").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("s-pass").value !== $("s-pass2").value) return say("Passwords do not match.");
    try {
      const r = await api("/api/auth/setup", "POST", {
        username: $("s-user").value,
        password: $("s-pass").value,
        question: $("s-q").value,
        answer: $("s-a").value,
      });
      $("code").textContent = r.recovery_code;
      show("code");
    } catch (err) { say(err.message); }
  });

  $("copy-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("code").textContent);
      $("copy-code").textContent = "Copied ✓";
    } catch (e) { say("Select the code and copy it manually."); }
  });
  $("to-admin").addEventListener("click", () => { location.href = "/admin"; });

  // login
  $("f-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/auth/login", "POST", {
        username: $("l-user").value,
        password: $("l-pass").value,
      });
      location.href = "/admin";
    } catch (err) { say(err.message); }
  });

  // forgot password
  let method = "answer";
  function setMethod(m) {
    method = m;
    $("m-answer").classList.toggle("on", m === "answer");
    $("m-code").classList.toggle("on", m === "code");
    $("q-wrap").hidden = m !== "answer";
    $("r-secret").value = "";
    $("r-secret").placeholder = m === "answer" ? "Your answer" : "XXXX-XXXX-XXXX-XXXX";
  }
  $("m-answer").addEventListener("click", () => setMethod("answer"));
  $("m-code").addEventListener("click", () => setMethod("code"));

  $("go-forgot").addEventListener("click", async () => {
    show("forgot");
    setMethod("answer");
    try {
      const r = await api("/api/auth/question", "GET");
      $("q-label").textContent = r.question;
    } catch (err) { say(err.message); }
  });
  $("go-login").addEventListener("click", () => show("login"));

  $("f-forgot").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("r-new").value !== $("r-new2").value) return say("Passwords do not match.");
    try {
      const r = await api("/api/auth/reset", "POST", {
        method,
        secret: $("r-secret").value,
        new_password: $("r-new").value,
      });
      if (r.recovery_code) {
        show("code");
        $("code").textContent = r.recovery_code;
        $("to-admin").textContent = "Saved. Go to sign in →";
        $("to-admin").onclick = () => { location.href = "/admin/login"; };
        say("Password updated. Your recovery code was renewed. Save the new one.", true);
      } else {
        show("login");
        say("Password updated. Please sign in.", true);
      }
    } catch (err) { say(err.message); }
  });

  show(document.body.dataset.mode === "setup" ? "setup" : "login");
})();
