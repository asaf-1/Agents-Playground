import { Link, useLocation } from "react-router-dom";
import { formatDate, ROLE_LABELS, STATUS_LABELS } from "../bankApi";
import { SignInPrompt } from "../components/SignInPrompt";
import { Avatar, Badge, PageHeader } from "../components/ui";
import { useBankSession } from "../useBankSession";

function Detail({
  label,
  value,
  id,
}: {
  label: string;
  value: string;
  id: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={`profile-${id}`}>
        {value || <span className="not-set">Not set</span>}
      </dd>
    </div>
  );
}

export function ProfilePage() {
  const { account, isLoading } = useBankSession();
  const location = useLocation();
  const state = (location.state ?? {}) as {
    welcome?: boolean;
    saved?: boolean;
  };

  return (
    <section data-testid="profile-page" className="page">
      <PageHeader
        eyebrow="You"
        title="Profile"
        description={<p className="page-sub">Your Playground Bank account.</p>}
        actions={
          account && (
            <Link
              className="btn btn-primary"
              data-testid="profile-edit-link"
              to="/profile/edit"
            >
              Edit profile
            </Link>
          )
        }
      />

      {isLoading && (
        <p className="state" data-testid="profile-loading">
          Loading your profile…
        </p>
      )}

      {!isLoading && !account && (
        <SignInPrompt next="/profile" title="Log in to see your profile" />
      )}

      {account && (
        <>
          {state.welcome && (
            <p
              className="callout callout-success"
              data-testid="profile-welcome"
            >
              Welcome to Playground Bank, {account.user.fullName.split(" ")[0]}!
              Your account is ready.
            </p>
          )}
          {state.saved && (
            <p className="callout callout-success" data-testid="profile-saved">
              Profile saved.
            </p>
          )}

          <div className="profile-grid">
            <div className="card card-pad">
              <div className="profile-head">
                <Avatar name={account.user.fullName} seed={account.user.id} />
                <div>
                  <h2 data-testid="profile-name">{account.user.fullName}</h2>
                  <p className="muted" data-testid="profile-email">
                    {account.user.email}
                  </p>
                </div>
              </div>
              <div className="profile-meta">
                <span data-testid="profile-role">
                  <Badge value={ROLE_LABELS[account.user.role]} />
                </span>
                <Badge value={STATUS_LABELS[account.user.status]} />
                {account.user.isDemo && <Badge value="Demo" />}
              </div>
              <p className="muted profile-since">
                Member since{" "}
                <span data-testid="profile-member-since">
                  {formatDate(account.user.createdAt, account.settings.locale)}
                </span>
              </p>
              {account.user.isDemo && (
                <p className="muted" data-testid="profile-demo-note">
                  This is a shared demo account, so it can't be changed. Sign up
                  for your own account to try editing.
                </p>
              )}
            </div>

            <div className="card card-pad">
              <h2>Contact details</h2>
              <dl className="detail-list">
                <Detail
                  label="Phone"
                  value={account.profile.phone}
                  id="phone"
                />
                <Detail
                  label="Address"
                  value={account.profile.addressLine}
                  id="address"
                />
                <Detail label="City" value={account.profile.city} id="city" />
                <Detail
                  label="Postal code"
                  value={account.profile.postalCode}
                  id="postal-code"
                />
                <Detail
                  label="Country"
                  value={account.profile.country}
                  id="country"
                />
              </dl>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
