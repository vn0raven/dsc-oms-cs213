function initials(name) {
  return String(name || "DSC")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part.charAt(0).toUpperCase()
    )
    .join("") || "DS";
}

function updateThemeButtons() {
  if (!window.DSCTheme) {
    return;
  }

  const preference =
    window.DSCTheme.getPreference();

  document
    .querySelectorAll(
      "[data-theme-choice]"
    )
    .forEach((button) => {
      const active =
        button.dataset.themeChoice ===
        preference;

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        String(active)
      );
    });
}

export function initializeHeaderControls(user) {
  const avatar =
    document.querySelector(
      "[data-profile-avatar]"
    );

  if (avatar) {
    avatar.textContent =
      initials(user?.name);
  }

  document
    .querySelectorAll(
      "[data-theme-choice]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const choice =
            button.dataset.themeChoice;

          if (
            ![
              "system",
              "light",
              "dark",
            ].includes(choice)
          ) {
            return;
          }

          window.DSCTheme
            ?.setPreference(choice);

          updateThemeButtons();
        }
      );
    });

  window.addEventListener(
    "dsc-theme-change",
    updateThemeButtons
  );

  updateThemeButtons();


  const profileRoot =
    document.querySelector(
      "[data-profile-menu]"
    );

  const profileButton =
    document.querySelector(
      "[data-profile-toggle]"
    );

  const profilePanel =
    document.querySelector(
      "[data-profile-panel]"
    );

  function closeProfile() {
    if (
      !profilePanel ||
      !profileButton
    ) {
      return;
    }

    profilePanel.hidden = true;

    profileButton.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  profileButton?.addEventListener(
    "click",
    (event) => {
      event.stopPropagation();

      if (!profilePanel) return;

      const opening =
        profilePanel.hidden;

      profilePanel.hidden =
        !opening;

      profileButton.setAttribute(
        "aria-expanded",
        String(opening)
      );
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        profileRoot &&
        !profileRoot.contains(
          event.target
        )
      ) {
        closeProfile();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeProfile();
      }
    }
  );
}
