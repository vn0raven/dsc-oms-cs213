async function request(
path,
options = {}
) {
const response = await fetch(
path,
{
...options,

headers: {
"Content-Type":
"application/json",

...(options.headers || {}),
},
}
);

let data = null;

const contentType =
response.headers.get(
"content-type"
);

if (
contentType?.includes(
"application/json"
)
) {
data = await response.json();
}

if (!response.ok) {
const error =
new Error(
data?.message ||
`Request failed (${response.status})`
);

error.status =
response.status;

error.code =
data?.error ||
"REQUEST_FAILED";

throw error;
}

return data;
}

export const api = {
get(path) {
return request(path);
},

post(
path,
body
) {
return request(
path,
{
method: "POST",

body:
body === undefined
? undefined
: JSON.stringify(body),
}
);
},

patch(
path,
body
) {
return request(
path,
{
method: "PATCH",
body:
JSON.stringify(body),
}
);
},
  del(path) { return request(path,{method: "DELETE"}); },
};
