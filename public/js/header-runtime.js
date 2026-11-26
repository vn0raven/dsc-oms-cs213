(() => {
  const STORAGE_KEY = "dsc-oms-theme";

  const media =
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

  function getPreference() {
    const value =
      localStorage.getItem(
        STORAGE_KEY
      );

    return [
      "system",
      "light",
      "dark",
    ].includes(value)
      ? value
      : "system";
  }

  function resolveTheme(preference) {
    if (preference === "system") {
      return media.matches
        ? "dark"
        : "light";
    }

    return preference;
  }

  function applyTheme(preference) {
    const resolved =
      resolveTheme(preference);

    localStorage.setItem(
      STORAGE_KEY,
      preference
    );

    document.documentElement.dataset.themePreference =
      preference;

    document.documentElement.dataset.theme =
      resolved;

    document.documentElement.style.colorScheme =
      resolved;

    updateButtons();
  }

  function updateButtons() {
    const preference =
      getPreference();

    document
      .querySelectorAll(
        "[data-runtime-theme]"
      )
      .forEach((button) => {
        const active =
          button.dataset.runtimeTheme ===
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

  function createControls() {
    const topbar =
      document.querySelector(
        ".topbar-right"
      );

    if (!topbar) {
      return false;
    }

    if (
      topbar.querySelector(
        "[data-dsc-runtime-header]"
      )
    ) {
      updateButtons();
      return true;
    }

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "dsc-runtime-header";

    wrapper.dataset.dscRuntimeHeader =
      "";

    wrapper.innerHTML = `
      <div
        class="dsc-runtime-theme"
        role="group"
        aria-label="Appearance"
      >
        <button
          type="button"
          data-runtime-theme="system"
        >
          System
        </button>

        <button
          type="button"
          data-runtime-theme="light"
        >
          Light
        </button>

        <button
          type="button"
          data-runtime-theme="dark"
        >
          Dark
        </button>
      </div>

      <button
        type="button"
        class="dsc-runtime-bell"
        data-topbar-notifications
        aria-label="Notifications"
        title="Notifications"
      >
        <span
          class="dsc-runtime-bell-icon"
          aria-hidden="true"
        ></span>
      </button>
    `;

    const profile =
      topbar.querySelector(
        ".topbar-profile"
      );

    if (profile) {
      topbar.insertBefore(
        wrapper,
        profile
      );
    }
    else {
      topbar.prepend(
        wrapper
      );
    }

    wrapper
      .querySelectorAll(
        "[data-runtime-theme]"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            applyTheme(
              button.dataset.runtimeTheme
            );
          }
        );
      });

    wrapper
      .querySelector(
        ".dsc-runtime-bell"
      )
      ?.addEventListener(
        "click",
        () => {
          if (
            typeof window.omsNavigate ===
            "function"
          ) {
            window.omsNavigate(
              "notifications"
            );

            return;
          }

          const nav =
            document.querySelector(
              '[data-page="notifications"], [data-nav="notifications"]'
            );

          nav?.click();
        }
      );

    updateButtons();

    return true;
  }

  function boot() {
    applyTheme(
      getPreference()
    );

    createControls();

    const observer =
      new MutationObserver(
        () => {
          createControls();
        }
      );

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      }
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      {
        once: true,
      }
    );
  }
  else {
    boot();
  }

  if (
    typeof media.addEventListener ===
    "function"
  ) {
    media.addEventListener(
      "change",
      () => {
        if (
          getPreference() ===
          "system"
        ) {
          applyTheme(
            "system"
          );
        }
      }
    );
  }
})();
