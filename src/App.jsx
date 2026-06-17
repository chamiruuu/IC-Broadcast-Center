import { useEffect, useMemo, useRef, useState } from "react";
import { createUniqueBroadcastId } from "./lib/broadcastId";
import {
  formatDateTime,
  insertFormatting,
  insertLinkFormatting,
  statusLabel,
  stripFormatting,
  toBo82PlainText,
  toSkypebotHtml,
} from "./lib/formatters";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const editableRoles = ["admin", "leader"];
const roleLabels = {
  admin: "Admin",
  leader: "Leader",
  cs: "CS",
};

const emptyEditor = {
  id: null,
  title: "",
  message: "",
  skypebot_group_ids: [],
  status: "draft",
  published_at: null,
  published_by: null,
};

function canEdit(profile) {
  return editableRoles.includes(profile?.role);
}

function canManageUsers(profile) {
  return profile?.role === "admin";
}

function joinNames(groups, ids = []) {
  return ids
    .map((id) => groups.find((group) => group.id === id)?.name)
    .filter(Boolean)
    .join(", ");
}

function Icon({ name }) {
  const paths = {
    add: <path d="M12 5v14M5 12h14" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: <path d="M8 8h10v10H8zM6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />,
    edit: <path d="m16.5 3.5 4 4L8 20H4v-4L16.5 3.5zM14 6l4 4" />,
  };

  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function IconButton({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} title={label} {...props}>
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function Modal({ title, eyebrow, children, onClose, className = "" }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
          <IconButton label="Close" onClick={onClose}><Icon name="close" /></IconButton>
        </div>
        {children}
      </section>
    </div>
  );
}

function ConfigMissing() {
  return (
    <main className="center-shell">
      <section className="auth-card">
        <p className="eyebrow">Setup needed</p>
        <h1>IC Broadcast Center</h1>
        <p className="muted">
          Add your Supabase URL and anon key to <code>.env</code>, then restart the dev server.
        </p>
        <pre className="setup-box">VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</pre>
      </section>
    </main>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    }

    setBusy(false);
  }

  return (
    <main className="center-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Internal broadcast operations</p>
        <h1>IC Broadcast Center</h1>
        <p className="muted">Sign in to draft, publish, copy, or complete announcements.</p>

        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
        </label>

        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>

        {error ? <p className="error">{error}</p> : null}
        <button className="primary" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Password updated. You can return to the main login screen.");
  }

  return (
    <main className="center-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="eyebrow">Account recovery</p>
        <h1>Reset password</h1>
        <p className="muted">Enter a new password for your IC Broadcast Center account.</p>
        <label>
          New password
          <input
            value={password}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>
        {message ? <p className={message.includes("updated") ? "success" : "error"}>{message}</p> : null}
        <button className="primary" disabled={busy}>{busy ? "Updating..." : "Update password"}</button>
      </form>
    </main>
  );
}

function AppShell({ profile, tab, setTab, onSignOut, children }) {
  const navItems = [
    { id: "active", label: "Active" },
    canEdit(profile) ? { id: "drafts", label: "Drafts" } : null,
    canEdit(profile) ? { id: "completed", label: "Completed" } : null,
    canEdit(profile) ? { id: "create", label: "Create" } : null,
    canEdit(profile) ? { id: "settings", label: "Lists" } : null,
    canManageUsers(profile) ? { id: "users", label: "Users" } : null,
  ].filter(Boolean);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="mark">ICB</p>
          <h1>IC Broadcast Center</h1>
        </div>

        <nav>
          {navItems.map((item) => (
            <button
              className={tab === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="profile-box">
          <strong>{profile.name}</strong>
          <span>{roleLabels[profile.role]}</span>
          <button className="ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}

function AnnouncementList({
  announcements,
  groups,
  csNames,
  profiles,
  mode,
  onCopy,
  onComplete,
  onEdit,
  onPublish,
  query,
  setQuery,
  profile,
}) {
  const filtered = announcements.filter((announcement) =>
    announcement.broadcast_id.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const profileMap = new Map(profiles.map((item) => [item.id, item]));

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{mode}</p>
          <h2>{mode === "Active" ? "Published broadcasts" : `${mode} broadcasts`}</h2>
        </div>
        <div className="header-actions">
          <label className="search">
            Search ID
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ICB-GK9TWE"
            />
          </label>
        </div>
      </div>

      <div className="broadcast-grid">
        {filtered.length ? (
          filtered.map((announcement) => (
            <article className="broadcast-card" key={announcement.id}>
              <div className="card-topline">
                <span className="broadcast-id">{announcement.broadcast_id}</span>
                <div className="card-actions">
                  {canEdit(profile) ? (
                    <IconButton label="Edit broadcast" onClick={() => onEdit(announcement)}>
                      <Icon name="edit" />
                    </IconButton>
                  ) : null}
                  <span className={`status ${announcement.status}`}>{statusLabel(announcement.status)}</span>
                </div>
              </div>

              <h3>{announcement.title}</h3>
              <p className="message-preview">{announcement.message}</p>

              <dl className="meta-grid">
                <div>
                  <dt>Skypebot Group</dt>
                  <dd>{joinNames(groups, announcement.skypebot_group_ids) || "Not selected"}</dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{formatDateTime(announcement.published_at)}</dd>
                </div>
                <div>
                  <dt>Published by</dt>
                  <dd>{profileMap.get(announcement.published_by)?.name || profileMap.get(announcement.updated_by)?.name || "-"}</dd>
                </div>
                {announcement.status === "completed" ? (
                  <>
                    <div>
                      <dt>Completed by</dt>
                      <dd>{announcement.completed_by_name || "-"}</dd>
                    </div>
                    <div>
                      <dt>Completed</dt>
                      <dd>{formatDateTime(announcement.completed_at)}</dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <div className="copy-row">
                {announcement.status !== "draft" ? (
                  <>
                    <button className="copy-action" onClick={() => onCopy(toSkypebotHtml(announcement.message), "Skypebot HTML")}>
                      <Icon name="copy" />
                      Skypebot
                    </button>
                    <button className="copy-action" onClick={() => onCopy(toBo82PlainText(announcement.message), "BO8.2 Plain Text")}>
                      <Icon name="copy" />
                      BO8.2
                    </button>
                  </>
                ) : null}

                {canEdit(profile) ? (
                  <>
                    {announcement.status === "draft" ? (
                      <button className="primary small" onClick={() => onPublish(announcement)}>
                        Publish
                      </button>
                    ) : null}
                  </>
                ) : null}

                {profile.role === "cs" && announcement.status === "published" ? (
                  <CompleteButton csNames={csNames} onComplete={(csName) => onComplete(announcement, csName)} />
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">
            <h3>No broadcasts found</h3>
            <p>Nothing matches this tab and Broadcast ID search yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CompleteButton({ csNames, onComplete }) {
  const [open, setOpen] = useState(false);
  const [csName, setCsName] = useState("");

  async function handleComplete() {
    if (!csName) {
      return;
    }

    await onComplete(csName);
    setOpen(false);
    setCsName("");
  }

  return (
    <div className="complete-box">
      {!open ? (
        <button className="primary small" onClick={() => setOpen(true)}>Mark completed</button>
      ) : (
        <>
          <select value={csName} onChange={(event) => setCsName(event.target.value)}>
            <option value="">Select CS name</option>
            {csNames.map((item) => (
              <option key={item.id} value={item.name}>{item.name}</option>
            ))}
          </select>
          <button className="primary small" onClick={handleComplete}>Confirm</button>
        </>
      )}
    </div>
  );
}

function Editor({ editor, setEditor, groups, onSave, saving }) {
  const messageRef = useRef(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [linkDialog, setLinkDialog] = useState(null);
  const skypebotHtml = toSkypebotHtml(editor.message);
  const plainText = toBo82PlainText(editor.message);
  const selectedStatus = editor.status === "published" ? "published" : "draft";

  function toggleGroup(id) {
    const exists = editor.skypebot_group_ids.includes(id);
    setEditor({
      ...editor,
      skypebot_group_ids: exists
        ? editor.skypebot_group_ids.filter((groupId) => groupId !== id)
        : [...editor.skypebot_group_ids, id],
    });
  }

  function applyMessageFormat(type) {
    if (type === "clear") {
      setEditor({ ...editor, message: stripFormatting(editor.message) });
      requestAnimationFrame(() => messageRef.current?.focus());
      return;
    }

    const textarea = messageRef.current;
    const selectionStart = textarea?.selectionStart ?? editor.message.length;
    const selectionEnd = textarea?.selectionEnd ?? editor.message.length;

    if (type === "link") {
      setLinkDialog({
        selectionStart,
        selectionEnd,
        label: editor.message.slice(selectionStart, selectionEnd),
        url: "https://",
      });
      return;
    }

    const result = insertFormatting(editor.message, selectionStart, selectionEnd, type);

    setEditor({ ...editor, message: result.value });
    requestAnimationFrame(() => {
      messageRef.current?.focus();
      messageRef.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function applyLink(event) {
    event.preventDefault();
    if (!linkDialog?.url || linkDialog.url === "https://") {
      return;
    }

    const result = insertLinkFormatting(
      editor.message,
      linkDialog.selectionStart,
      linkDialog.selectionEnd,
      linkDialog.label,
      linkDialog.url,
    );

    setEditor({ ...editor, message: result.value });
    setLinkDialog(null);
    requestAnimationFrame(() => {
      messageRef.current?.focus();
      messageRef.current?.setSelectionRange(result.cursor, result.cursor);
    });
  }

  return (
    <section className="panel compose-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">{editor.id ? "Edit broadcast" : "New broadcast"}</p>
          <h2>Compose announcement</h2>
        </div>
        <div className="compose-actions">
          <div className="status-switch" aria-label="Broadcast status">
            <button
              className={selectedStatus === "draft" ? "selected" : ""}
              onClick={() => setEditor({ ...editor, status: "draft" })}
              type="button"
            >
              Draft
            </button>
            <button
              className={selectedStatus === "published" ? "selected" : ""}
              onClick={() => setEditor({ ...editor, status: "published" })}
              type="button"
            >
              Published
            </button>
          </div>
          <button className="primary" disabled={saving} onClick={() => onSave(selectedStatus)}>
            {saving ? "Saving..." : "Save broadcast"}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <form className="editor-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Title
            <input
              value={editor.title}
              onChange={(event) => setEditor({ ...editor, title: event.target.value })}
              placeholder="Short internal title"
            />
          </label>

          <div className="message-field">
            <div className="message-toolbar">
              <span className="field-label">Message</span>
              <div className="format-actions" aria-label="Message formatting">
                <button type="button" onClick={() => applyMessageFormat("bold")} title="Bold selected text">
                  <strong>B</strong>
                </button>
                <button type="button" onClick={() => applyMessageFormat("italic")} title="Italic selected text">
                  <em>I</em>
                </button>
                <button type="button" onClick={() => applyMessageFormat("link")} title="Add link">
                  Link
                </button>
                <button type="button" onClick={() => applyMessageFormat("bullet")} title="Bullet list">
                  Bullet
                </button>
                <button type="button" onClick={() => applyMessageFormat("numbered")} title="Numbered list">
                  Numbered
                </button>
                <button type="button" onClick={() => applyMessageFormat("clear")} title="Clear formatting">
                  Clear
                </button>
              </div>
            </div>
            <textarea
              ref={messageRef}
              value={editor.message}
              onChange={(event) => setEditor({ ...editor, message: event.target.value })}
              placeholder="Write the announcement exactly as CS should send it."
              rows={12}
            />
          </div>

          <div>
            <span className="field-label">Skypebot Groups</span>
            <div className="chip-list">
              {groups.map((group) => (
                <button
                  className={editor.skypebot_group_ids.includes(group.id) ? "chip selected" : "chip"}
                  key={group.id}
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>

          <p className="compose-hint">
            Choose Draft while preparing. Switch to Published when CS should see and send it.
          </p>
        </form>

        <aside className="preview-pane">
          <div className="preview-header">
            <div>
              <p className="eyebrow">Main preview</p>
              <h3>Skypebot Preview</h3>
            </div>
            <div className="preview-actions">
              <button type="button" onClick={() => setPreviewModal("html")}>HTML</button>
              <button type="button" onClick={() => setPreviewModal("bo82")}>BO8.2</button>
            </div>
          </div>
          <div className="output-block main-preview-block">
            <div
              className="render-preview"
              dangerouslySetInnerHTML={{ __html: skypebotHtml || "Preview will appear here." }}
            />
          </div>
        </aside>
      </div>

      {previewModal ? (
        <Modal
          title={previewModal === "html" ? "Skypebot HTML" : "BO8.2 Plain Text"}
          eyebrow="Generated output"
          className="output-modal"
          onClose={() => setPreviewModal(null)}
        >
          <pre className="modal-preview">
            {previewModal === "html"
              ? skypebotHtml || "HTML preview will appear here."
              : plainText || "Plain text preview will appear here."}
          </pre>
        </Modal>
      ) : null}

      {linkDialog ? (
        <Modal title="Add link" eyebrow="Message formatting" onClose={() => setLinkDialog(null)}>
          <form className="modal-form" onSubmit={applyLink}>
            <label>
              Link text
              <input
                value={linkDialog.label}
                onChange={(event) => setLinkDialog({ ...linkDialog, label: event.target.value })}
                placeholder="Text to show"
                autoFocus
              />
            </label>
            <label>
              URL
              <input
                value={linkDialog.url}
                onChange={(event) => setLinkDialog({ ...linkDialog, url: event.target.value })}
                placeholder="https://example.com"
                type="url"
                required
              />
            </label>
            <div className="action-row">
              <button type="button" onClick={() => setLinkDialog(null)}>Cancel</button>
              <button className="primary">Insert link</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function Settings({ title, items, setItems, tableName, reload }) {
  const [name, setName] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function addItem() {
    if (!name.trim()) {
      return;
    }

    setBusy(true);
    const { error } = await supabase.from(tableName).insert({ name: name.trim(), active: true });
    setBusy(false);

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setModalOpen(false);
    await reload();
  }

  async function updateItem(item, patch) {
    const { error } = await supabase.from(tableName).update(patch).eq("id", item.id);
    if (error) {
      alert(error.message);
      return;
    }

    setItems(items.map((current) => (current.id === item.id ? { ...current, ...patch } : current)));
    setEditingItem(null);
    setName("");
  }

  function openAddModal() {
    setName("");
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEditModal(item) {
    setName(item.name);
    setEditingItem(item);
    setModalOpen(true);
  }

  function closeModal() {
    setName("");
    setEditingItem(null);
    setModalOpen(false);
  }

  async function saveModal() {
    if (!name.trim()) {
      return;
    }

    if (editingItem) {
      await updateItem(editingItem, { name: name.trim() });
      return;
    }

    await addItem();
  }

  return (
    <section className="list-manager">
      <div className="section-header compact">
        <div>
          <p className="eyebrow">Managed list</p>
          <h2>{title}</h2>
          <p className="section-note">{items.length} total, {items.filter((item) => item.active).length} active</p>
        </div>
        <IconButton label={`Add ${title}`} className="primary" onClick={openAddModal}>
          <Icon name="add" />
        </IconButton>
      </div>

      <div className="list-table">
        {items.map((item) => (
          <div className="list-row" key={item.id}>
            <div className="list-name">
              <strong>{item.name}</strong>
              <span>{title === "CS Names" ? "CS display name" : "Skypebot destination"}</span>
            </div>
            <span className={item.active ? "state-pill active" : "state-pill inactive"}>
              {item.active ? "Active" : "Inactive"}
            </span>
            <div className="row-actions">
              <IconButton label={`Edit ${item.name}`} onClick={() => openEditModal(item)}>
                <Icon name="edit" />
              </IconButton>
              <button onClick={() => updateItem(item, { active: !item.active })}>
                {item.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalOpen ? (
        <Modal
          title={editingItem ? `Edit ${title}` : `Add ${title}`}
          eyebrow="Managed list"
          onClose={closeModal}
        >
          <div className="modal-form">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Add ${title}`} autoFocus />
            </label>
            <div className="action-row">
              <button onClick={closeModal}>Cancel</button>
              <button className="primary" disabled={busy} onClick={saveModal}>
                {editingItem ? "Save changes" : "Add"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function UserAdmin({ profiles, reload }) {
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "leader" });
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  async function createUser(event) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.functions.invoke("admin-users", {
      body: {
        action: "create",
        email: form.email,
        password: form.password,
        name: form.name,
        role: form.role,
      },
    });
    setBusy(false);

    if (error) {
      alert(error.message);
      return;
    }

    setForm({ email: "", password: "", name: "", role: "leader" });
    setModalOpen(false);
    await reload();
  }

  async function resetPassword(email) {
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "reset-password", email },
    });

    if (error) {
      alert(error.message);
      return;
    }

    alert(`Password reset email sent to ${email}.`);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Admin only</p>
          <h2>User accounts</h2>
        </div>
        <button className="primary" onClick={() => setModalOpen(true)}>
          <Icon name="add" />
          New user
        </button>
      </div>

      <div className="table-like">
        {profiles.map((user) => (
          <div className="table-row user-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email} - {roleLabels[user.role]}</span>
            </div>
            <button onClick={() => resetPassword(user.email)}>Send reset email</button>
          </div>
        ))}
      </div>

      {modalOpen ? (
        <Modal title="Create user" eyebrow="Admin only" onClose={() => setModalOpen(false)}>
          <form className="modal-form" onSubmit={createUser}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Full name"
                required
                autoFocus
              />
            </label>
            <label>
              Email
              <input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="name@company.com"
                type="email"
                required
              />
            </label>
            <label>
              Temporary password
              <input
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="Minimum 8 characters"
                type="password"
                required
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="admin">Admin</option>
                <option value="leader">Leader</option>
                <option value="cs">CS</option>
              </select>
            </label>
            <div className="action-row">
              <button type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="primary" disabled={busy}>Create account</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

export default function App() {
  const isResetPath = window.location.pathname === "/reset-password";
  const sessionUserIdRef = useRef(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("active");
  const [announcements, setAnnouncements] = useState([]);
  const [csNames, setCsNames] = useState([]);
  const [groups, setGroups] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [editor, setEditor] = useState(emptyEditor);
  const [saving, setSaving] = useState(false);

  const activeAnnouncements = useMemo(
    () => announcements.filter((item) => item.status === "published"),
    [announcements],
  );
  const draftAnnouncements = useMemo(
    () => announcements.filter((item) => item.status === "draft"),
    [announcements],
  );
  const completedAnnouncements = useMemo(
    () => announcements.filter((item) => item.status === "completed"),
    [announcements],
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      sessionUserIdRef.current = data.session?.user?.id ?? null;
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null;

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        return;
      }

      if (sessionUserIdRef.current === nextUserId && event !== "SIGNED_OUT") {
        return;
      }

      sessionUserIdRef.current = nextUserId;
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }

    loadProfile();
  }, [session]);

  useEffect(() => {
    if (profile) {
      reloadAll();
    }
  }, [profile]);

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (error) {
      setToast(`Profile error: ${error.message}`);
      await supabase.auth.signOut();
    } else {
      setProfile(data);
    }

    setLoading(false);
  }

  async function reloadAll() {
    const announcementSelect = supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    const csSelect = supabase.from("cs_names").select("*").order("name");
    const groupSelect = supabase.from("skypebot_groups").select("*").order("name");

    const [announcementResult, csResult, groupResult] = await Promise.all([
      announcementSelect,
      csSelect,
      groupSelect,
    ]);

    if (announcementResult.error) {
      setToast(announcementResult.error.message);
    } else {
      setAnnouncements(announcementResult.data ?? []);
    }

    if (!csResult.error) {
      setCsNames(csResult.data ?? []);
    }

    if (!groupResult.error) {
      setGroups(groupResult.data ?? []);
    }

    if (canEdit(profile)) {
      const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      setProfiles(data ?? []);
    }
  }

  async function handleCopy(value, label) {
    await navigator.clipboard.writeText(value);
    setToast(`${label} copied.`);
  }

  async function handleSave(status) {
    if (!editor.title.trim() || !editor.message.trim()) {
      setToast("Title and message are required.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const patch = {
      title: editor.title.trim(),
      message: editor.message,
      skypebot_group_ids: editor.skypebot_group_ids,
      status,
      updated_by: profile.id,
      published_at: status === "draft" ? null : editor.published_at ?? now,
      published_by: status === "draft" ? null : editor.published_by ?? profile.id,
    };

    const result = editor.id
      ? await supabase.from("announcements").update(patch).eq("id", editor.id)
      : await supabase.from("announcements").insert({
          ...patch,
          broadcast_id: await createUniqueBroadcastId(supabase),
          created_by: profile.id,
        });

    setSaving(false);

    if (result.error) {
      setToast(result.error.message);
      return;
    }

    setEditor(emptyEditor);
    setTab(status === "draft" ? "drafts" : "active");
    setToast(status === "draft" ? "Draft saved." : "Broadcast published.");
    await reloadAll();
  }

  async function handlePublish(announcement) {
    const { error } = await supabase
      .from("announcements")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: profile.id,
        updated_by: profile.id,
      })
      .eq("id", announcement.id);

    if (error) {
      setToast(error.message);
      return;
    }

    setToast(`${announcement.broadcast_id} published.`);
    await reloadAll();
  }

  async function handleComplete(announcement, csName) {
    const { error } = await supabase.rpc("complete_announcement", {
      p_announcement_id: announcement.id,
      p_cs_name: csName,
    });

    if (error) {
      setToast(error.message);
      return;
    }

    setToast(`${announcement.broadcast_id} completed by ${csName}.`);
    await reloadAll();
  }

  function editAnnouncement(announcement) {
    setEditor({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      skypebot_group_ids: announcement.skypebot_group_ids ?? [],
      status: announcement.status,
      published_at: announcement.published_at,
      published_by: announcement.published_by,
    });
    setTab("create");
  }

  if (!isSupabaseConfigured) {
    return <ConfigMissing />;
  }

  if (loading) {
    return <main className="center-shell"><div className="loader">Loading IC Broadcast Center...</div></main>;
  }

  if (isResetPath) {
    return <ResetPassword />;
  }

  if (!session || !profile) {
    return <Login />;
  }

  return (
    <AppShell
      profile={profile}
      tab={tab}
      setTab={setTab}
      onSignOut={() => supabase.auth.signOut()}
    >
      {toast ? (
        <button className="toast" onClick={() => setToast("")}>{toast}</button>
      ) : null}

      {tab === "active" ? (
        <AnnouncementList
          announcements={activeAnnouncements}
          groups={groups}
          csNames={csNames.filter((item) => item.active)}
          profiles={profiles}
          mode="Active"
          onCopy={handleCopy}
          onComplete={handleComplete}
          onEdit={editAnnouncement}
          onPublish={handlePublish}
          query={query}
          setQuery={setQuery}
          profile={profile}
        />
      ) : null}

      {tab === "drafts" && canEdit(profile) ? (
        <AnnouncementList
          announcements={draftAnnouncements}
          groups={groups}
          csNames={csNames}
          profiles={profiles}
          mode="Draft"
          onCopy={handleCopy}
          onComplete={handleComplete}
          onEdit={editAnnouncement}
          onPublish={handlePublish}
          query={query}
          setQuery={setQuery}
          profile={profile}
        />
      ) : null}

      {tab === "completed" && canEdit(profile) ? (
        <AnnouncementList
          announcements={completedAnnouncements}
          groups={groups}
          csNames={csNames}
          profiles={profiles}
          mode="Completed"
          onCopy={handleCopy}
          onComplete={handleComplete}
          onEdit={editAnnouncement}
          onPublish={handlePublish}
          query={query}
          setQuery={setQuery}
          profile={profile}
        />
      ) : null}

      {tab === "create" && canEdit(profile) ? (
        <Editor
          editor={editor}
          setEditor={setEditor}
          groups={groups.filter((item) => item.active)}
          onSave={handleSave}
          onCancel={() => {
            setEditor(emptyEditor);
            setTab("active");
          }}
          saving={saving}
        />
      ) : null}

      {tab === "settings" && canEdit(profile) ? (
        <div className="settings-grid">
          <Settings
            title="CS Names"
            items={csNames}
            setItems={setCsNames}
            tableName="cs_names"
            reload={reloadAll}
          />
          <Settings
            title="Skypebot Groups"
            items={groups}
            setItems={setGroups}
            tableName="skypebot_groups"
            reload={reloadAll}
          />
        </div>
      ) : null}

      {tab === "users" && canManageUsers(profile) ? (
        <UserAdmin profiles={profiles} reload={reloadAll} />
      ) : null}
    </AppShell>
  );
}
