(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("primary-nav");

  if (header && toggle && nav) {
    const setOpen = (open) => {
      header.setAttribute("data-nav-open", String(open));
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", () => {
      const open = header.getAttribute("data-nav-open") !== "true";
      setOpen(open);
    });

    nav.addEventListener("click", (e) => {
      const target = e.target;
      if (target instanceof HTMLAnchorElement) setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  const form = document.querySelector(".contact-form");
  const note = form ? form.querySelector(".form-note") : null;

  if (form && note) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const phone = String(data.get("phone") || "").trim();
      const email = String(data.get("email") || "").trim();
      const project = String(data.get("project") || "").trim();
      const message = String(data.get("message") || "").trim();

      if (!name || !phone) {
        note.textContent = "Please add your name and phone so we can reach you.";
        note.setAttribute("data-state", "error");
        return;
      }

      const subject = `Epoxy quote request — ${name}`;
      const bodyLines = [
        `Name: ${name}`,
        `Phone: ${phone}`,
        email ? `Email: ${email}` : null,
        project ? `Project: ${project}` : null,
        "",
        message || "(no additional details)",
      ].filter(Boolean);

      const href =
        "mailto:REPLACE_ME_EMAIL@example.com" +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(bodyLines.join("\n"));

      note.textContent = "Opening your email app…";
      note.setAttribute("data-state", "success");
      window.location.href = href;
    });
  }

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
