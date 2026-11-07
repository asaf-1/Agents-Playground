// Request bodies for the classic site's create-user API, shared by the specs.

// A user the API accepts.
export const validCreateUserPayload = {
  email: "ops.analyst@agenticqa.local",
  first_name: "Dana",
  last_name: "Meyers",
  phone_number: 541234567,
};

// A user the API refuses: the email is not an email and the last name is empty.
export const invalidCreateUserPayload = {
  email: "not-an-email",
  first_name: "Dana",
  last_name: "",
  phone_number: 541234567,
};

// A phone number sent as a string instead of a number, which makes create-user
// answer 500; the API diagnosis scenario explains why.
export const typeMismatchCreateUserPayload = {
  phone_number: "0541234567",
};
