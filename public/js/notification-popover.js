import {
  api,
} from "./api.js";

import {
  refreshNotificationIndicators,
} from "./notifications.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getNotifications(response) {
  if (Array.isArray(response)) {
    return response;
  }

  return Array.isArray(
    response?.notifications
  )
    ? response.notifications
    : [];
}

function relativeTime(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const difference =
    date.getTime() -
    Date.now();

  const absolute =
    Math.abs(difference);

  if (absolute < 60000) {
    return "Just now";
  }

  const formatter =
    new Intl.RelativeTimeFormat(
      "en",
      {
        numeric: "auto",
      }
    );

  if (absolute < 3600000) {
    return formatter.format(
      Math.round(
        difference / 60000
      ),
      "minute"
    );
  }

  if (absolute < 86400000) {
    return formatter.format(
      Math.round(
        difference / 3600000
      ),
      "hour"
    );
  }

  return formatter.format(
    Math.round(
      difference / 86400000
    ),
    "day"
  );
}

function referencePage(type) {
  return {
    TASK: "tasks",
    PROJECT: "projects",
    REQUEST: "requests",
  }[type] || null;
}

function renderPreview(items) {
  if (!items.length) {
    return `
      <div
        class="notification-popover-empty"
      >
        <strong>
          You're all caught up.
        </strong>

        <span>
          No notifications to show.
        </span>
      </div>
    `;
  }

  return items
    .slice(0, 5)
    .map(
      (notification) => `
        <button
          type="button"
          class="
            notification-preview-item
            ${notification.status === "Unread"
              ? "unread"
              : ""}
          "
          data-notification-preview-id="${
            escapeHtml(
              notification.id
            )
          }"
        >
          <span
            class="notification-preview-dot"
          >
            ${
              notification.status ===
              "Unread"
                ? "<i></i>"
                : ""
            }
          </span>

          <span
            class="notification-preview-content"
          >
            <strong
              class="notification-preview-title"
            >
              ${escapeHtml(
                notification.title
              )}
            </strong>

            <span
              class="notification-preview-message"
            >
              ${escapeHtml(
                notification.message
              )}
            </span>

            <small
              class="notification-preview-time"
            >
              ${escapeHtml(
                relativeTime(
                  notification.createdAt
                )
              )}
            </small>
          </span>
        </button>
      `
    )
    .join("");
}

export function initializeNotificationPopover(
  navigate
) {
  const root =
    document.querySelector(
      "[data-notification-menu]"
    );

  const button =
    document.querySelector(
      "[data-topbar-notifications]"
    );

  const panel =
    document.querySelector(
      "[data-notification-panel]"
    );

  const list =
    document.querySelector(
      "[data-notification-preview-list]"
    );

  const markAll =
    document.querySelector(
      "[data-notification-mark-all]"
    );

  const viewAll =
    document.querySelector(
      "[data-notification-view-all]"
    );

  if (
    !root ||
    !button ||
    !panel ||
    !list
  ) {
    return;
  }

  let notifications = [];
  let loading = false;

  function close() {
    panel.hidden = true;

    button.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  async function load() {
    if (loading) {
      return;
    }

    loading = true;

    list.innerHTML = `
      <div
        class="notification-popover-loading"
      >
        Loading notifications...
      </div>
    `;

    try {
      const response =
        await api.get(
          "/api/notifications"
        );

      notifications =
        getNotifications(response);

      list.innerHTML =
        renderPreview(
          notifications
        );

      if (markAll) {
        markAll.disabled =
          !notifications.some(
            (item) =>
              item.status ===
              "Unread"
          );
      }
    }
    catch (error) {
      list.innerHTML = `
        <div
          class="notification-popover-empty"
        >
          <strong>
            Unable to load notifications.
          </strong>

          <span>
            ${escapeHtml(
              error?.message ||
              "Please try again."
            )}
          </span>
        </div>
      `;
    }
    finally {
      loading = false;
    }
  }

  button.addEventListener(
    "click",
    async (event) => {
      event.stopPropagation();

      const opening =
        panel.hidden;

      if (!opening) {
        close();
        return;
      }

      panel.hidden = false;

      button.setAttribute(
        "aria-expanded",
        "true"
      );

      await load();
    }
  );

  list.addEventListener(
    "click",
    async (event) => {
      const row =
        event.target.closest(
          "[data-notification-preview-id]"
        );

      if (!row) {
        return;
      }

      const notification =
        notifications.find(
          (item) =>
            item.id ===
            row.dataset
              .notificationPreviewId
        );

      if (!notification) {
        return;
      }

      if (
        notification.status ===
        "Unread"
      ) {
        try {
          await api.post(
            `/api/notifications/${
              encodeURIComponent(
                notification.id
              )
            }/read`
          );
        }
        catch {
          /*
           * Navigation can continue.
           */
        }
      }

      const page =
        referencePage(
          notification.referenceType
        );

      if (
        page &&
        notification.referenceId
      ) {
        sessionStorage.setItem(
          "omsNotificationReference",
          JSON.stringify({
            type:
              notification.referenceType,
            id:
              notification.referenceId,
          })
        );
      }

      close();

      await refreshNotificationIndicators();

      if (page) {
        await navigate?.(page);
      }
      else {
        await load();
      }
    }
  );

  markAll?.addEventListener(
    "click",
    async (event) => {
      event.stopPropagation();

      markAll.disabled = true;

      try {
        await api.post(
          "/api/notifications/read-all"
        );

        await refreshNotificationIndicators();
        await load();
      }
      catch {
        markAll.disabled = false;
      }
    }
  );

  viewAll?.addEventListener(
    "click",
    async (event) => {
      event.stopPropagation();

      close();

      await navigate?.(
        "notifications"
      );
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !root.contains(
          event.target
        )
      ) {
        close();
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        close();
      }
    }
  );
}
