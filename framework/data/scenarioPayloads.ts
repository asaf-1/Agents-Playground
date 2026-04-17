export const validCreateUserPayload = {
  email: "ops.analyst@agenticqa.local",
  first_name: "Dana",
  last_name: "Meyers",
  phone_number: 541234567
};

export const invalidCreateUserPayload = {
  email: "not-an-email",
  first_name: "Dana",
  last_name: "",
  phone_number: 541234567
};

export const typeMismatchCreateUserPayload = {
  phone_number: "0541234567"
};
