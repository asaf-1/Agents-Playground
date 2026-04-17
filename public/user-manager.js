const tbody = document.getElementById("user-tbody");
const userCount = document.getElementById("user-count");
const errorEl = document.getElementById("user-error");
const searchInput = document.getElementById("user-search");
const roleFilter = document.getElementById("role-filter");
const addBtn = document.getElementById("add-user-btn");
const refreshBtn = document.getElementById("refresh-users");
const bulkActionsBtn = document.getElementById("bulk-actions-btn");
const bulkActionsMenu = document.getElementById("bulk-actions-menu");
const openInviteModalBtn = document.querySelector("[data-testid='open-invite-modal']");
const refreshDirectoryBtn = document.querySelector("[data-testid='refresh-directory']");
const inviteDialogBackdrop = document.getElementById("invite-dialog-backdrop");
const inviteEmailInput = document.getElementById("invite-email");
const closeInviteBtn = document.getElementById("close-invite");
const confirmInviteBtn = document.getElementById("confirm-invite");
const selectedUserOutput = document.getElementById("selected-user-output");

let allUsers = [];
let currentSearch = "";
let currentRoleFilter = "All";

function setSelectedUserMessage(message) {
  selectedUserOutput.textContent = message;
}

function closeBulkActions() {
  bulkActionsMenu.hidden = true;
  bulkActionsBtn.setAttribute("aria-expanded", "false");
}

function openBulkActions() {
  bulkActionsMenu.hidden = false;
  bulkActionsBtn.setAttribute("aria-expanded", "true");
}

function showInviteDialog() {
  inviteDialogBackdrop.hidden = false;
  inviteEmailInput.focus();
}

function closeInviteDialog() {
  inviteDialogBackdrop.hidden = true;
  inviteEmailInput.value = "";
}

function getFilteredUsers() {
  return allUsers.filter((user) => {
    const matchesSearch = currentSearch
      ? user.name.toLowerCase().includes(currentSearch) ||
        user.role.toLowerCase().includes(currentSearch) ||
        user.status.toLowerCase().includes(currentSearch)
      : true;
    const matchesRole = currentRoleFilter === "All" ? true : user.role === currentRoleFilter;

    return matchesSearch && matchesRole;
  });
}

function renderUsers(users) {
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#6b7280;padding:1rem;">No users found.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((user) => `
    <tr data-testid="user-row">
      <td>${user.id}</td>
      <td>${user.name}</td>
      <td>${user.role}</td>
      <td class="status-${(user.status || "").toLowerCase()}">${user.status}</td>
      <td>
        <button
          class="user-row-action"
          type="button"
          data-testid="view-user-action"
          data-user-id="${user.id}"
        >
          View
        </button>
      </td>
    </tr>
  `).join("");
}

function applyFilters() {
  const filtered = getFilteredUsers();
  renderUsers(filtered);
  userCount.textContent = String(filtered.length);
}

async function loadUsers() {
  errorEl.style.display = "none";
  tbody.innerHTML = '<tr><td colspan="5" class="spinner">Loading users...</td></tr>';

  try {
    const response = await fetch("/api/users");
    const data = await response.json();
    allUsers = data.users || [];
    applyFilters();
  } catch (error) {
    errorEl.textContent = "Failed to load users. Check the server.";
    errorEl.style.display = "block";
    tbody.innerHTML = "";
    userCount.textContent = "0";
  }
}

searchInput.addEventListener("input", () => {
  currentSearch = searchInput.value.trim().toLowerCase();
  applyFilters();
});

roleFilter.addEventListener("change", () => {
  currentRoleFilter = roleFilter.value;
  applyFilters();
});

refreshBtn.addEventListener("click", async () => {
  await loadUsers();
  setSelectedUserMessage("User directory refreshed.");
});

bulkActionsBtn.addEventListener("click", () => {
  if (bulkActionsMenu.hidden) {
    openBulkActions();
  } else {
    closeBulkActions();
  }
});

document.addEventListener("click", (event) => {
  if (
    !bulkActionsMenu.hidden &&
    !bulkActionsMenu.contains(event.target) &&
    !bulkActionsBtn.contains(event.target)
  ) {
    closeBulkActions();
  }
});

openInviteModalBtn.addEventListener("click", () => {
  closeBulkActions();
  showInviteDialog();
});

refreshDirectoryBtn.addEventListener("click", async () => {
  closeBulkActions();
  await loadUsers();
  setSelectedUserMessage("Directory refreshed from the bulk actions menu.");
});

closeInviteBtn.addEventListener("click", closeInviteDialog);

confirmInviteBtn.addEventListener("click", () => {
  const email = inviteEmailInput.value.trim() || "new teammate";
  setSelectedUserMessage(`Prepared invite for ${email}.`);
  closeInviteDialog();
});

inviteDialogBackdrop.addEventListener("click", (event) => {
  if (event.target === inviteDialogBackdrop) {
    closeInviteDialog();
  }
});

tbody.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-testid='view-user-action']");

  if (!actionButton) {
    return;
  }

  const userId = actionButton.getAttribute("data-user-id");
  const selectedUser = allUsers.find((user) => user.id === userId);

  if (selectedUser) {
    setSelectedUserMessage(`Viewing ${selectedUser.name} (${selectedUser.role}).`);
  }
});

addBtn.addEventListener("click", async () => {
  const name = prompt("Enter new user name:");

  if (!name) {
    return;
  }

  const role = prompt("Enter role (Admin / Editor / Viewer):") || "Viewer";

  try {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, role })
    });

    if (response.ok) {
      await loadUsers();
      setSelectedUserMessage(`Added ${name.trim()} as ${role}.`);
    }
  } catch {
    errorEl.textContent = "Failed to add user.";
    errorEl.style.display = "block";
  }
});

loadUsers();
