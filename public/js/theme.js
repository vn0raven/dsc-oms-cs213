(() => {
  const STORAGE_KEY =
    "dsc-oms-theme";

  const allowed =
    new Set([
      "system",
      "light",
      "dark",
    ]);

  const media =
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

  function storedPreference() {
    const value =
      localStorage.getItem(
        STORAGE_KEY
      );

    return allowed.has(value)
      ? value
      : "system";
  }

  function resolvedTheme(
    preference =
      storedPreference()
  ) {
    if (preference === "system") {
      return media.matches
        ? "dark"
        : "light";
    }

    return preference;
  }

  function apply(
    preference,
    persist = true
  ) {
    const safePreference =
      allowed.has(preference)
      ? preference
      : "system";

    const resolved =
      resolvedTheme(
        safePreference
      );

    if (persist) {
      localStorage.setItem(
        STORAGE_KEY,
        safePreference
      );
    }

    document.documentElement.dataset.themePreference =
      safePreference;

    /*
     * IMPORTANT:
     * data-theme is ALWAYS the actual
     * resolved light/dark theme.
     *
     * This prevents CSS media queries
     * from creating a half-light /
     * half-dark interface.
     */
    document.documentElement.dataset.theme =
      resolved;

    document.documentElement.style.colorScheme =
      resolved;

    window.dispatchEvent(
      new CustomEvent(
        "dsc-theme-change",
        {
          detail: {
            preference:
              safePreference,
            resolved,
          },
        }
      )
    );

    return resolved;
  }

  function setPreference(value) {
    return apply(
      value,
      true
    );
  }

  function getPreference() {
    return storedPreference();
  }

  function getResolvedTheme() {
    return resolvedTheme(
      storedPreference()
    );
  }

  function handleSystemChange() {
    if (
      storedPreference() ===
      "system"
    ) {
      apply(
        "system",
        false
      );
    }
  }

  if (
    typeof media.addEventListener ===
    "function"
  ) {
    media.addEventListener(
      "change",
      handleSystemChange
    );
  }
  else {
    media.addListener(
      handleSystemChange
    );
  }

  window.DSCTheme = {
    setPreference,
    getPreference,
    getResolvedTheme,
    apply,
  };

  apply(
    storedPreference(),
    false
  );
})();
