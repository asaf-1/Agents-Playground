// Client for Playground Bank's GraphQL API at /api/bank/graphql. A GraphQL
// answer is always HTTP 200: what went wrong is in `errors`, so this never
// throws on a query that the server understood and refused.

export interface GraphqlError {
  message: string;
  path?: (string | number)[];
  locations?: { line: number; column: number }[];
  extensions?: { code?: string; stacktrace?: string[] };
}

export interface GraphqlResult<T = unknown> {
  data?: T;
  errors?: GraphqlError[];
}

export async function runGraphql<T = unknown>(
  query: string,
  variables: Record<string, unknown> | undefined,
  runKey: string,
): Promise<GraphqlResult<T>> {
  const response = await fetch(
    `/api/bank/graphql?runKey=${encodeURIComponent(runKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    },
  );
  const text = await response.text();
  if (!text) {
    return { errors: [{ message: `The server answered ${response.status}.` }] };
  }
  try {
    return JSON.parse(text) as GraphqlResult<T>;
  } catch {
    return { errors: [{ message: text.slice(0, 500) }] };
  }
}

// --- The schema, read from the server with introspection ---------------------

export interface SchemaField {
  name: string;
  description: string | null;
  type: string;
  args: { name: string; type: string }[];
}

export interface SchemaType {
  name: string;
  description: string | null;
  fields: SchemaField[];
}

interface IntrospectedTypeRef {
  kind: string;
  name: string | null;
  ofType: IntrospectedTypeRef | null;
}

interface IntrospectedField {
  name: string;
  description: string | null;
  type: IntrospectedTypeRef;
  args: { name: string; type: IntrospectedTypeRef }[];
}

interface IntrospectedType {
  kind: string;
  name: string;
  description: string | null;
  fields: IntrospectedField[] | null;
}

// "[MoneyAccount!]!" from the nested shape introspection returns.
function typeName(ref: IntrospectedTypeRef | null): string {
  if (!ref) {
    return "";
  }
  if (ref.kind === "NON_NULL") {
    return `${typeName(ref.ofType)}!`;
  }
  if (ref.kind === "LIST") {
    return `[${typeName(ref.ofType)}]`;
  }
  return ref.name ?? "";
}

const INTROSPECTION = `
  query Schema {
    __schema {
      types {
        kind
        name
        description
        fields {
          name
          description
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
          args { name type { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }
  }
`;

// Query and Mutation first, then the rest alphabetically; the built-in
// introspection types (__Schema and friends) are left out.
export async function loadSchema(runKey: string): Promise<SchemaType[]> {
  const result = await runGraphql<{ __schema: { types: IntrospectedType[] } }>(
    INTROSPECTION,
    undefined,
    runKey,
  );
  if (!result.data) {
    throw new Error(result.errors?.[0]?.message ?? "The schema didn't load.");
  }
  const types = result.data.__schema.types
    .filter(
      (type) =>
        type.kind === "OBJECT" && !type.name.startsWith("__") && type.fields,
    )
    .map((type) => ({
      name: type.name,
      description: type.description,
      fields: (type.fields ?? []).map((field) => ({
        name: field.name,
        description: field.description,
        type: typeName(field.type),
        args: field.args.map((arg) => ({
          name: arg.name,
          type: typeName(arg.type),
        })),
      })),
    }));
  const rank = (name: string) =>
    name === "Query" ? 0 : name === "Mutation" ? 1 : 2;
  return types.sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
}

// --- Ready-made queries ------------------------------------------------------

export interface Example {
  name: string;
  query: string;
  variables?: string;
}

export const EXAMPLES: Example[] = [
  {
    name: "Your accounts",
    query: `# Ask for exactly the fields you want, and nothing else.
{
  accounts {
    id
    number
    kind
    name
    balanceCents
  }
}`,
  },
  {
    name: "Four screens in one request",
    query: `# REST needs four addresses for this. GraphQL answers in one.
{
  me {
    fullName
    role
  }
  accounts {
    number
    balanceCents
  }
  notifications {
    unread
  }
  requests {
    incoming {
      amountCents
      status
      requesterName
    }
  }
}`,
  },
  {
    name: "One account with its history",
    query: `# Paste an account id from "Your accounts" into the variables below.
query History($id: ID!) {
  account(id: $id) {
    number
    balanceCents
    transactions(type: "out", page: 1, pageSize: 5) {
      total
      totalPages
      transactions {
        createdAt
        description
        amountCents
        counterparty
      }
    }
  }
}`,
    variables: `{
  "id": "paste-an-account-id-here"
}`,
  },
  {
    name: "A loan quote",
    query: `# Nothing is saved: this only works out what a loan would cost.
{
  loanQuote(amountCents: 1500000, termMonths: 24) {
    monthlyPaymentCents
    totalInterestCents
    totalRepaidCents
    schedule {
      month
      paymentCents
      balanceCents
    }
  }
}`,
  },
  {
    name: "Add funds (mutation)",
    query: `# A mutation changes something. Demo accounts are read-only.
mutation AddFunds($id: ID!, $cents: Cents!) {
  addFunds(accountId: $id, amountCents: $cents) {
    number
    balanceCents
  }
}`,
    variables: `{
  "id": "paste-an-account-id-here",
  "cents": 25000
}`,
  },
  {
    name: "Send money (mutation)",
    query: `# The same rules as the REST API: your own account, enough money,
# and never to a demo account.
mutation Send($from: ID!, $to: String!, $cents: Cents!) {
  transfer(fromAccountId: $from, toAccountNumber: $to, amountCents: $cents, memo: "From GraphQL") {
    replayed
    transfer {
      id
      amountCents
    }
    fromAccount {
      balanceCents
    }
  }
}`,
    variables: `{
  "from": "paste-an-account-id-here",
  "to": "PB-1234-5678",
  "cents": 1000
}`,
  },
  {
    name: "Support tickets",
    query: `{
  tickets {
    id
    subject
    status
    updatedAt
  }
}`,
  },
];
