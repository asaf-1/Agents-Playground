// The Books page, for an Admin: every account's balance against the sum of
// its history rows. They always agree, because every balance change writes
// its history row in the same transaction; an account where they don't is
// money that moved without a record ("a more real back end", phase 4).

// The data cache.
import { useQuery } from "@tanstack/react-query";
// The books call and formats.
import { formatMoney, formatUtc, getBooks } from "../bankApi";
// The sign-in card, the badge and heading, and who is signed in.
import { SignInPrompt } from "../components/SignInPrompt";
import { Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

// The verdict, the totals, and any account out of balance.
export function BooksPage() {
  // Who is signed in, whether they are an Admin, and the check.
  const { user, account, isLoading } = useBankSession();
  const settings = account?.settings;
  const admin = user?.role === "admin";
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["bank", "books"],
    queryFn: getBooks,
    enabled: admin,
  });

  // The heading, then the sign-in card, a no-access note, or the report.
  return (
    <section data-testid="books-page" className="page">
      <PageHeader
        eyebrow="Back office"
        title="Books"
        description={
          <p className="page-sub">
            Every account's balance against the sum of its history. Demo
            accounts carry a hand-written sample history, so they are counted
            but not checked.
          </p>
        }
        actions={
          admin && (
            <button
              type="button"
              className="btn"
              data-testid="books-recheck"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              {isFetching ? "Checking…" : "Check again"}
            </button>
          )
        }
      />

      {/* Signed out, or not an Admin. */}
      {!isLoading && !user && (
        <SignInPrompt
          next="/admin/books"
          title="Log in as an Admin to see this"
        />
      )}
      {user && !admin && (
        <div className="card card-pad" data-testid="books-forbidden">
          <p className="account-title">You don't have access to this page.</p>
          <p className="muted">The books are for Admins only.</p>
        </div>
      )}

      {/* Loading or an error. */}
      {admin && isPending && <p className="state">Checking the books…</p>}
      {isError && (
        <p role="alert" className="callout">
          {(error as Error).message}
        </p>
      )}

      {/* The verdict and the totals. */}
      {data && (
        <>
          <div className="card card-pad" data-testid="books-summary">
            <div className="section-head">
              <h2 className="section-title">
                {data.checkedAccounts} accounts checked
              </h2>
              <span data-testid="books-verdict">
                <Badge value={data.balanced ? "Balanced" : "Out of balance"} />
              </span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Balances</dt>
                <dd className="mono" data-testid="books-balances">
                  {formatMoney(data.totalBalanceCents, settings)}
                </dd>
              </div>
              <div>
                <dt>History rows</dt>
                <dd className="mono" data-testid="books-lines">
                  {formatMoney(data.totalLinesCents, settings)}
                </dd>
              </div>
              <div>
                <dt>Difference</dt>
                <dd className="mono cell-strong" data-testid="books-difference">
                  {formatMoney(data.differenceCents, settings)}
                </dd>
              </div>
              <div>
                <dt>Sample (demo) accounts</dt>
                <dd data-testid="books-sample">{data.sampleAccounts}</dd>
              </div>
              <div>
                <dt>Checked (UTC)</dt>
                <dd className="mono">{formatUtc(data.checkedAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Every account where the two disagree. */}
          {data.outOfBalance.length > 0 && (
            <div className="card table-card">
              <div className="table-wrap">
                <table data-testid="books-out-of-balance">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Owner</th>
                      <th className="cell-num">Balance</th>
                      <th className="cell-num">History</th>
                      <th className="cell-num">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outOfBalance.map((row) => (
                      <tr
                        key={row.accountId}
                        data-testid={`books-row-${row.accountNumber}`}
                      >
                        <td className="cell-mono">{row.accountNumber}</td>
                        <td>{row.ownerEmail}</td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.balanceCents, settings)}
                        </td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.linesCents, settings)}
                        </td>
                        <td className="cell-num cell-mono">
                          {formatMoney(row.differenceCents, settings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
