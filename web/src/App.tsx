import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/Layout";

// Each page is its own chunk, loaded when it's first opened, so the first load
// stays small as the bank grows.
const AboutPage = lazy(() =>
  import("./pages/AboutPage").then((m) => ({ default: m.AboutPage })),
);
const AccountPage = lazy(() =>
  import("./pages/AccountPage").then((m) => ({ default: m.AccountPage })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })),
);
const BankAccountPage = lazy(() =>
  import("./pages/BankAccountPage").then((m) => ({
    default: m.BankAccountPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const RequestsPage = lazy(() =>
  import("./pages/RequestsPage").then((m) => ({ default: m.RequestsPage })),
);
const SupportInboxPage = lazy(() =>
  import("./pages/SupportInboxPage").then((m) => ({
    default: m.SupportInboxPage,
  })),
);
const SupportPage = lazy(() =>
  import("./pages/SupportPage").then((m) => ({ default: m.SupportPage })),
);
const TicketPage = lazy(() =>
  import("./pages/TicketPage").then((m) => ({ default: m.TicketPage })),
);
const BillPayPage = lazy(() =>
  import("./pages/BillPayPage").then((m) => ({ default: m.BillPayPage })),
);
const BankPage = lazy(() =>
  import("./pages/BankPage").then((m) => ({ default: m.BankPage })),
);
const EditProfilePage = lazy(() =>
  import("./pages/EditProfilePage").then((m) => ({
    default: m.EditProfilePage,
  })),
);
const CoinPage = lazy(() =>
  import("./pages/CoinPage").then((m) => ({ default: m.CoinPage })),
);
const GraphqlPage = lazy(() =>
  import("./pages/GraphqlPage").then((m) => ({ default: m.GraphqlPage })),
);
const MarketsPage = lazy(() =>
  import("./pages/MarketsPage").then((m) => ({ default: m.MarketsPage })),
);
const PortfolioPage = lazy(() =>
  import("./pages/PortfolioPage").then((m) => ({ default: m.PortfolioPage })),
);
const WalletPage = lazy(() =>
  import("./pages/WalletPage").then((m) => ({ default: m.WalletPage })),
);
const HomePage = lazy(() =>
  import("./pages/HomePage").then((m) => ({ default: m.HomePage })),
);
const LoanRequestsPage = lazy(() =>
  import("./pages/LoanRequestsPage").then((m) => ({
    default: m.LoanRequestsPage,
  })),
);
const LoansPage = lazy(() =>
  import("./pages/LoansPage").then((m) => ({ default: m.LoansPage })),
);
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const OrdersPage = lazy(() =>
  import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })),
);
const ProductDetailPage = lazy(() =>
  import("./pages/ProductDetailPage").then((m) => ({
    default: m.ProductDetailPage,
  })),
);
const ProductsPage = lazy(() =>
  import("./pages/ProductsPage").then((m) => ({ default: m.ProductsPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SignUpPage = lazy(() =>
  import("./pages/SignUpPage").then((m) => ({ default: m.SignUpPage })),
);
const TransferPage = lazy(() =>
  import("./pages/TransferPage").then((m) => ({ default: m.TransferPage })),
);
const UsersPage = lazy(() =>
  import("./pages/UsersPage").then((m) => ({ default: m.UsersPage })),
);

export function App() {
  return (
    <AppLayout>
      <Suspense
        fallback={
          <p className="state" data-testid="page-loading">
            Loading…
          </p>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/bank" element={<BankPage />} />
          <Route path="/bank/accounts/:id" element={<BankAccountPage />} />
          <Route path="/bank/transfer" element={<TransferPage />} />
          <Route path="/bank/bills" element={<BillPayPage />} />
          <Route path="/bank/loans" element={<LoansPage />} />
          <Route path="/bank/requests" element={<RequestsPage />} />
          <Route path="/markets" element={<MarketsPage />} />
          <Route path="/markets/:symbol" element={<CoinPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/support/:id" element={<TicketPage />} />
          <Route path="/graphql" element={<GraphqlPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/edit" element={<EditProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/loans" element={<LoanRequestsPage />} />
          <Route path="/admin/support" element={<SupportInboxPage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}
