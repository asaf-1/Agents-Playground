// Request bodies the functional, contract and scenario specs share, for the
// bank's back office (POST /api/users) and its transfers
// (POST /api/bank/transfers).

// A back-office user the API accepts (CreateUserRequest in bank/openapi.json).
// Each call names a new user, so parallel tests never create the same one.
export function validBackOfficeUser() {
  return {
    name: `Dana Meyers ${Date.now().toString(36)}`,
    role: "Viewer",
  };
}

// One the API refuses: no name.
export const invalidBackOfficeUser = { name: "", role: "Viewer" };

// A transfer whose amount is written as text ("5000") where the schema says a
// whole number of cents (BankTransferRequest.amountCents is an integer). The
// bank must refuse it with a 400 that names the field.
export function textAmountTransfer(
  fromAccountId: string,
  toAccountNumber: string,
) {
  return { fromAccountId, toAccountNumber, amountCents: "5000" };
}
