(() => {
  const token = document.querySelector('meta[name="app-token"]').content;
  const post = (path, data) =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Token": token },
      body: data ? JSON.stringify(data) : undefined,
    });

  const bar = document.createElement("div");
  bar.className = "adminbar";
  bar.innerHTML =
    '<span class="tag">ADMIN</span>' +
    '<a href="/chat" target="_blank" rel="noopener">Employee view</a>' +
    '<button type="button" id="ab-pw">Change password</button>' +
    '<button type="button" id="ab-out">Sign out</button>';
  document.body.appendChild(bar);

  const dlg = document.createElement("dialog");
  dlg.id = "pw-dialog";
  dlg.innerHTML =
    "<form method='dialog' id='pw-form'><h3>Change password</h3>" +
    "<label for='pw-cur'>Current password</label><input id='pw-cur' type='password' autocomplete='current-password' required maxlength='128'>" +
    "<label for='pw-new'>New password</label><input id='pw-new' type='password' autocomplete='new-password' required minlength='8' maxlength='128'>" +
    "<div id='pw-msg'></div>" +
    "<div class='acts'><button type='button' id='pw-cancel'>Cancel</button><button type='submit' class='go'>Update</button></div></form>";
  document.body.appendChild(dlg);

  const msg = dlg.querySelector("#pw-msg");

  document.getElementById("ab-pw").addEventListener("click", () => {
    msg.textContent = "";
    dlg.querySelector("form").reset();
    dlg.showModal();
  });
  dlg.querySelector("#pw-cancel").addEventListener("click", () => dlg.close());

  dlg.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const res = await post("/api/auth/change", {
      current: dlg.querySelector("#pw-cur").value,
      new_password: dlg.querySelector("#pw-new").value,
    });
    let data = {};
    try { data = await res.json(); } catch (err) {}
    msg.style.color = res.ok ? "#4ade80" : "#ff6b81";
    msg.textContent = res.ok ? "Password changed." : data.error || "Could not change password.";
    if (res.ok) setTimeout(() => dlg.close(), 900);
  });

  document.getElementById("ab-out").addEventListener("click", async () => {
    await post("/api/auth/logout");
    location.href = "/";
  });
})();
