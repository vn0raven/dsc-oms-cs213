const COLUMN_MAP = {
  task: {
    headers: [
      "Task ID",
      "Task Name",
    ],

    values(task) {
      return [
        task.id,
        task.title,
      ];
    },
  },

  project: {
    headers: [
      "Project",
    ],

    values(task) {
      return [
        task.eventName || task.projectName || "",
      ];
    },
  },

  department: {
    headers: [
      "Department",
    ],

    values(task) {
      return [
        task.departmentName || "",
      ];
    },
  },

  assignee: {
    headers: [
      "Assignee",
    ],

    values(task) {
      return [
        task.assignee?.name || "Unassigned",
      ];
    },
  },

  priority: {
    headers: [
      "Priority",
    ],

    values(task) {
      return [
        task.priority || "",
      ];
    },
  },

  status: {
    headers: [
      "Status",
    ],

    values(task) {
      return [
        task.status || "",
      ];
    },
  },

  progress: {
    headers: [
      "Progress",
    ],

    values(task) {
      return [
        `${Math.max(
          0,
          Math.min(
            100,
            Number(task.progress || 0)
          )
        )}%`,
      ];
    },
  },

  startDate: {
    headers: [
      "Start Date",
    ],

    values(task) {
      return [
        task.startDate || "",
      ];
    },
  },

  deadline: {
    headers: [
      "Deadline",
    ],

    values(task) {
      return [
        task.deadline || "",
      ];
    },
  },

  updated: {
    headers: [
      "Updated",
    ],

    values(task) {
      return [
        task.updatedAt || "",
      ];
    },
  },
};

export function safeSpreadsheetValue(value) {
  const text =
    String(value ?? "");

  if (
    /^(?:[\s\uFEFF\u200B\u2060]*[=+\-@]|[\t\r])/.test(text)
  ) {
    return `'${text}`;
  }

  return text;
}

function csvCell(value) {
  const safe =
    safeSpreadsheetValue(value);

  return `"${safe.replaceAll(
    '"',
    '""'
  )}"`;
}

function exportColumns(columnIds) {
  const requested =
    Array.isArray(columnIds)
    ? columnIds
    : [];

  const valid =
    requested.filter(
      (id) => COLUMN_MAP[id]
    );

  return valid.length
    ? valid
    : ["task"];
}

export function buildCsv(tasks, columnIds) {
  const columns =
    exportColumns(columnIds);

  const headers =
    columns.flatMap(
      (id) =>
        COLUMN_MAP[id].headers
    );

  const rows =
    tasks.map((task) =>
      columns.flatMap(
        (id) =>
          COLUMN_MAP[id].values(task)
      )
    );

  return [
    headers,
    ...rows,
  ]
    .map(
      (row) =>
        row
          .map(csvCell)
          .join(",")
    )
    .join("\r\n");
}

function dateStamp() {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function exportTaskCsv(
  tasks,
  columnIds
) {
  const csv =
    buildCsv(
      Array.isArray(tasks)
        ? tasks
        : [],
      columnIds
    );

  const blob =
    new Blob(
      [
        "\uFEFF",
        csv,
      ],
      {
        type:
          "text/csv;charset=utf-8",
      }
    );

  const url =
    URL.createObjectURL(blob);

  const link =
    document.createElement("a");

  link.href = url;

  link.download =
    `DSC-OMS_Tasks_${dateStamp()}.csv`;

  document.body.appendChild(link);

  link.click();
  link.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );
}
