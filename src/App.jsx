import { useEffect, useMemo, useRef, useState } from "react";
import { createUniqueBroadcastId } from "./lib/broadcastId";
import {
  formatDateTime,
  statusLabel,
  toBo82PlainText,
  toSkypebotHtml,
} from "./lib/formatters";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Highlight from "@tiptap/extension-highlight";

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
  original_status: "draft",
  published_at: null,
  published_by: null,
};

function canEdit(profile) {
  return editableRoles.includes(profile?.role);
}

function canManageUsers(profile) {
  return profile?.role === "admin";
}

async function functionErrorMessage(error) {
  if (!error) {
    return "";
  }

  if (error.context?.json) {
    try {
      const body = await error.context.json();
      return body?.error || error.message;
    } catch {
      return error.message;
    }
  }

  return error.message || "Function request failed.";
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
  onView,
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
                  <button onClick={() => onView(announcement)}>View</button>
                  {canEdit(profile) && announcement.status !== "completed" ? (
                    <IconButton label="Edit broadcast" onClick={() => onEdit(announcement)}>
                      <Icon name="edit" />
                    </IconButton>
                  ) : null}
                  <span className={`status ${announcement.status}`}>{statusLabel(announcement.status)}</span>
                </div>
              </div>

              <h3>{announcement.title}</h3>
              <div className="message-preview">
                <div
                  className="render-preview"
                  dangerouslySetInnerHTML={{ __html: announcement.message }}
                />
              </div>

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
  const [isCompleting, setIsCompleting] = useState(false);
  
  // Start with their last used name, or empty if it's their first time
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem("preferredCsName") || "");

  // 1. Check if what they typed matches an official name exactly (ignoring uppercase/lowercase)
  const exactMatch = csNames.find(
    (cs) => cs.name.toLowerCase() === searchTerm.trim().toLowerCase()
  );

  // 2. Filter the clickable suggestions below the input as they type
  const filteredNames = csNames.filter((cs) =>
    cs.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  async function handleComplete(selectedName) {
    setIsCompleting(true);
    localStorage.setItem("preferredCsName", selectedName); // Save for next time
    await onComplete(selectedName);
  }

  // Handle when they press "Enter" in the text box
  function handleSubmit(event) {
    event.preventDefault();
    if (exactMatch) {
      handleComplete(exactMatch.name);
    }
  }

  return (
    <div className="complete-box">
      <button
        className="primary small"
        onClick={() => setOpen(true)}
        disabled={isCompleting}
      >
        {isCompleting ? "Completing..." : "Mark completed"}
      </button>

      {open && !isCompleting && (
        <Modal
          title="Who is completing this?"
          eyebrow="Confirm action"
          onClose={() => setOpen(false)}
        >
          <form className="modal-form" onSubmit={handleSubmit}>
            <label>
              Type your official CS Name
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </label>

            {/* If they type a wrong name, tell them immediately */}
            {filteredNames.length === 0 && (
              <p style={{ color: "#dc2626", fontSize: "13px", marginTop: "4px" }}>
                Name not found. Must match an admin-approved name.
              </p>
            )}

            {/* Show matching names as clickable chips */}
            {filteredNames.length > 0 && (
              <div className="cs-name-grid" style={{ marginTop: "12px", maxHeight: "150px" }}>
                {filteredNames.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`chip ${exactMatch?.name === item.name ? "selected" : ""}`}
                    onClick={() => handleComplete(item.name)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}

            <div className="action-row" style={{ marginTop: "24px" }}>
              <button type="button" onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="submit"
                className="primary"
                disabled={!exactMatch} // Locks the button if there is no exact match
              >
                Confirm
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function AnnouncementDetail({ announcement, groups, profiles, versions, completionLogs, onClose, onCopy }) {
  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const relatedVersions = versions
    .filter((item) => item.announcement_id === announcement.id)
    .sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at));
  const relatedCompletions = completionLogs
    .filter((item) => item.announcement_id === announcement.id)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const skypebotHtml = toSkypebotHtml(announcement.message);
  const plainText = toBo82PlainText(announcement.message);

  return (
    <Modal title={announcement.broadcast_id} eyebrow={statusLabel(announcement.status)} className="detail-modal" onClose={onClose}>
      <div className="detail-layout">
        <section className="detail-main">
          <h3>{announcement.title}</h3>
          <div className="detail-preview" dangerouslySetInnerHTML={{ __html: skypebotHtml }} />
          <div className="copy-row">
            <button className="copy-action" onClick={() => onCopy(skypebotHtml, "Skypebot HTML")}>
              <Icon name="copy" />
              Skypebot
            </button>
            <button className="copy-action" onClick={() => onCopy(plainText, "BO8.2 Plain Text")}>
              <Icon name="copy" />
              BO8.2
            </button>
          </div>
        </section>

        <aside className="detail-side">
          <dl className="detail-meta">
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
            {announcement.completed_at ? (
              <div>
                <dt>Completed</dt>
                <dd>{announcement.completed_by_name} - {formatDateTime(announcement.completed_at)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="history-block">
            <h4>Completion</h4>
            {relatedCompletions.length ? relatedCompletions.map((item) => (
              <p key={item.id}>{item.completed_by_name} completed at {formatDateTime(item.completed_at)}</p>
            )) : <p>No completion log yet.</p>}
          </div>

          <div className="history-block">
            <h4>Version History</h4>
            {relatedVersions.length ? relatedVersions.map((item) => {
              const isCompletionLog = ["status changed", "status_changed"].includes(item.change_type)
                && statusLabel(item.status)?.includes("Completed");
              const displayName = isCompletionLog
                ? announcement.completed_by_name || profileMap.get(item.changed_by)?.name
                : profileMap.get(item.changed_by)?.name;

              return (
                <div className="history-item" key={item.id}>
                  <strong>{item.change_type.replace("_", " ")}</strong>
                  <span>{statusLabel(item.status) || item.change_type} by {displayName || "-"} at {formatDateTime(item.changed_at)}</span>
                </div>
              );
            }) : <p>No version history yet.</p>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function Editor({ editor, setEditor, groups, onSave, onDelete, saving }) {
  const [linkDialog, setLinkDialog] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const selectedStatus = editor.status === "published" ? "published" : "draft";

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
    ],
    content: editor.message,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
      },
    },
    onUpdate: ({ editor: e }) => {
      setEditor({ ...editor, message: e.getHTML() });
    },
  });

  const skypebotHtml = toSkypebotHtml(editor.message);
  const plainText = toBo82PlainText(editor.message);

  useEffect(() => {
    if (!tiptapEditor) {
      return;
    }

    if (!editor.message && tiptapEditor.isEmpty) {
      return;
    }

    if (editor.message && tiptapEditor.getHTML() === editor.message) {
      return;
    }

    tiptapEditor.commands.setContent(editor.message || "", false);
  }, [editor.message, tiptapEditor]);

  function toggleGroup(id) {
    const exists = editor.skypebot_group_ids.includes(id);
    setEditor({
      ...editor,
      skypebot_group_ids: exists
        ? editor.skypebot_group_ids.filter((groupId) => groupId !== id)
        : [...editor.skypebot_group_ids, id],
    });
  }

  function applyLink(event) {
    event.preventDefault();
    if (!linkDialog?.url || linkDialog.url === "https://") {
      return;
    }

    tiptapEditor.chain().focus().setLink({ href: linkDialog.url }).run();
    setLinkDialog(null);
  }

  function requestSave() {
    if (selectedStatus === "published" && editor.original_status !== "published") {
      setConfirmPublish(true);
      return;
    }

    onSave(selectedStatus);
  }

  if (!tiptapEditor) {
    return null;
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
              <button className={selectedStatus === "draft" ? "selected" : ""} onClick={() => setEditor({ ...editor, status: "draft" })} type="button">Draft</button>
              <button className={selectedStatus === "published" ? "selected" : ""} onClick={() => setEditor({ ...editor, status: "published" })} type="button">Published</button>
            </div>
          <button className="primary" disabled={saving} onClick={requestSave}>
            {saving ? "Saving..." : "Save broadcast"}
          </button>
        </div>
      </div>

      <div className="editor-layout">
        <form className="editor-form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Title
            <input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} placeholder="Short internal title" />
          </label>

          <div className="message-field">
            <span className="field-label">Message</span>

            <div className="modern-toolbar">
              <div className="toolbar-group">
                <select onChange={(e) => tiptapEditor.chain().focus().setFontFamily(e.target.value).run()} className="toolbar-select" value={tiptapEditor.getAttributes("textStyle").fontFamily || ""}>
                  <option value="">Default Font</option>
                  <option value="Arial">Arial</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times</option>
                  <option value="Verdana">Verdana</option>
                </select>

                <select onChange={(e) => tiptapEditor.chain().focus().toggleHeading({ level: parseInt(e.target.value) }).run()} className="toolbar-select">
                  <option value="0">Normal Text</option>
                  <option value="1">Heading 1</option>
                  <option value="2">Heading 2</option>
                  <option value="3">Heading 3</option>
                </select>
              </div>

              <div className="toolbar-group">
                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleBold().run()} className={tiptapEditor.isActive("bold") ? "active" : ""}><b>B</b></button>
                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleItalic().run()} className={tiptapEditor.isActive("italic") ? "active" : ""}><i>I</i></button>
                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleStrike().run()} className={tiptapEditor.isActive("strike") ? "active" : ""}><s>S</s></button>

                <input type="color" onInput={(event) => tiptapEditor.chain().focus().setColor(event.target.value).run()} value={tiptapEditor.getAttributes("textStyle").color || "#000000"} className="color-picker" title="Text Color" />

                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleHighlight({ color: "#fffbeb" }).run()} className={tiptapEditor.isActive("highlight") ? "active" : ""} title="Highlight">A</button>
              </div>

              <div className="toolbar-group">
                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleBulletList().run()} className={tiptapEditor.isActive("bulletList") ? "active" : ""}>• List</button>
                <button type="button" onClick={() => tiptapEditor.chain().focus().toggleOrderedList().run()} className={tiptapEditor.isActive("orderedList") ? "active" : ""}>1. List</button>
                <button type="button" onClick={() => setLinkDialog({ url: "https://" })} className={tiptapEditor.isActive("link") ? "active" : ""}>Link</button>
                <button type="button" onClick={() => tiptapEditor.chain().focus().setHorizontalRule().run()}>Divider</button>
              </div>
            </div>

            <EditorContent editor={tiptapEditor} />
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

          {editor.id ? (
            <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #fee2e2" }}>
              <button
                type="button"
                onClick={() => onDelete(editor.id)}
                style={{ color: "#dc2626", background: "transparent", border: "none", cursor: "pointer", fontWeight: "600" }}
              >
                Delete this broadcast
              </button>
            </div>
          ) : null}

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

      {linkDialog && (
        <Modal title="Add link" eyebrow="Message formatting" onClose={() => setLinkDialog(null)}>
          <form className="modal-form" onSubmit={applyLink}>
            <label>URL <input value={linkDialog.url} onChange={(e) => setLinkDialog({ ...linkDialog, url: e.target.value })} type="url" required autoFocus /></label>
            <div className="action-row"><button type="button" onClick={() => setLinkDialog(null)}>Cancel</button><button className="primary">Insert</button></div>
          </form>
        </Modal>
      )}

      {confirmPublish ? (
        <Modal title="Publish broadcast?" eyebrow="Confirmation" onClose={() => setConfirmPublish(false)}>
          <div className="modal-form">
            <p className="muted">
              Publishing makes this broadcast visible to CS users immediately.
            </p>
            <div className="action-row">
              <button onClick={() => setConfirmPublish(false)}>Keep draft</button>
              <button
                className="primary"
                onClick={() => {
                  setConfirmPublish(false);
                  onSave("published");
                }}
              >
                Publish now
              </button>
            </div>
          </div>
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
      alert(await functionErrorMessage(error));
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
      alert(await functionErrorMessage(error));
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

// The new, modern auto-dismissing toast component
function ModernToast({ message, type = "success", onClose }) {
  useEffect(() => {
    // 1. Play the sound when the toast appears
    const audio = new Audio('/notification.mp3');
    audio.volume = 0.5; // Keep it subtle, not too loud
    audio.play().catch((e) => console.log("Browser blocked auto-play sound:", e));

    // 2. Auto-dismiss after 3.5 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 3500);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`modern-toast ${type}`}>
      <div className="toast-icon">
        {type === "success" ? "✨" : "⚠️"}
      </div>
      <div className="toast-content">
        <h4>{type === "success" ? "Success" : "Notice"}</h4>
        <p>{message}</p>
      </div>
      <button className="toast-close" onClick={onClose}>×</button>
      {/* The shrinking progress bar */}
      <div className="toast-progress"></div>
    </div>
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
  const [versions, setVersions] = useState([]);
  const [completionLogs, setCompletionLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [editor, setEditor] = useState(emptyEditor);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
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

  useEffect(() => {
    if (!profile) {
      return undefined;
    }

    const channel = supabase
      .channel("ic-broadcast-center-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => reloadAll(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

      const [versionsResult, completionsResult] = await Promise.all([
        supabase.from("announcement_versions").select("*").order("changed_at", { ascending: false }),
        supabase.from("completion_logs").select("*").order("completed_at", { ascending: false }),
      ]);

      if (!versionsResult.error) {
        setVersions(versionsResult.data ?? []);
      }

      if (!completionsResult.error) {
        setCompletionLogs(completionsResult.data ?? []);
      }
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

    if (editor.original_status === "completed") {
      setToast("Completed broadcasts cannot be edited. Reopen flow is not enabled yet.");
      return;
    }

    setSaving(true);
    try {
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

      if (result.error) {
        setToast(result.error.message);
        return;
      }

      setEditor(emptyEditor);
      setTab(status === "draft" ? "drafts" : "active");
      setToast(status === "draft" ? "Draft saved." : "Broadcast published.");
      await reloadAll();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not save broadcast.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Are you sure you want to permanently delete this broadcast? This cannot be undone.")) {
      return;
    }

    try {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) {
        throw error;
      }

      setAnnouncements((current) => current.filter((announcement) => announcement.id !== id));
      setEditor(emptyEditor);
      setTab("active");
      setToast("Broadcast deleted successfully.");
      await reloadAll();
    } catch (error) {
      console.error("Error deleting:", error);
      setToast(error?.message || "Failed to delete broadcast.");
    }
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
      original_status: announcement.status,
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
      {/* NEW MODERN TOAST RENDERER */}
      {toast && (
        <ModernToast 
          message={toast} 
          type="success" // You can dynamically change this if you have error toasts!
          onClose={() => setToast(null)} 
        />
      )}

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
          onView={setSelectedAnnouncement}
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
          onView={setSelectedAnnouncement}
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
          onView={setSelectedAnnouncement}
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
          onDelete={handleDelete}
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

      {selectedAnnouncement ? (
        <AnnouncementDetail
          announcement={announcements.find((item) => item.id === selectedAnnouncement.id) ?? selectedAnnouncement}
          groups={groups}
          profiles={profiles}
          versions={versions}
          completionLogs={completionLogs}
          onClose={() => setSelectedAnnouncement(null)}
          onCopy={handleCopy}
        />
      ) : null}
    </AppShell>
  );
}
